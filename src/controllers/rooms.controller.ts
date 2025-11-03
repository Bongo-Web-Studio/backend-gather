// src/controllers/rooms.controller.ts
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../logger';

const ALLOWED_PRIVACY = ['PUBLIC', 'PRIVATE', 'INVITE_ONLY'] as const;
type Privacy = (typeof ALLOWED_PRIVACY)[number];

function parseCookieHeader(header?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

async function extractOwnerId(req: Request): Promise<string | null> {
  // 1) OIDC (express-openid-connect)
  const oidcUser = (req as any).oidc?.user;
  if (oidcUser?.sub) return oidcUser.sub as string;

  // 2) req.user (if you attach user by JWT middleware)
  if ((req as any).user?.id) return (req as any).user.id as string;

  // 3) JWT cookie named 'token' (fallback)
  try {
    // prefer cookie-parser if present
    const token =
      (req as any).cookies?.token ||
      parseCookieHeader(req.headers.cookie || '')['token'] ||
      undefined;

    if (!token) return null;
    const payload = jwt.verify(token, config.jwtSecret) as any;
    if (payload?.sub) return payload.sub as string;
  } catch (err) {
    logger.warn({ err }, 'Failed to parse JWT from cookie in extractOwnerId');
  }

  return null;
}

async function ensureUniqueSlug(baseSlug: string) {
  let slug = baseSlug;
  let counter = 0;
  // try a reasonably small number of collisions to avoid infinite loop
  while (await prisma.room.findUnique({ where: { slug } })) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
    if (counter > 100) {
      // extremely unlikely, but safe-guard
      throw new Error('Could not generate unique slug for room');
    }
  }
  return slug;
}

/**
 * Create a room
 * - requires authenticated user (owner)
 * - validates input and ensures slug uniqueness
 * - checks MapTemplate existence or returns helpful error
 * - creates an initial Participant entry for the owner (joined)
 */
export async function createRoom(req: Request, res: Response) {
  try {
    // Basic input validation + sanitization
    const rawName = (req.body?.name ?? '').toString().trim();
    if (!rawName || rawName.length < 1) {
      return res.status(400).json({ error: 'Room name is required' });
    }
    if (rawName.length > 200) {
      return res.status(400).json({ error: 'Room name too long (max 200 chars)' });
    }

    const rawSlug = req.body?.slug ? String(req.body.slug).trim() : undefined;
    const mapTemplateId = req.body?.mapTemplateId ? String(req.body.mapTemplateId) : undefined;
    const rawPrivacy = req.body?.privacy ? String(req.body.privacy).toUpperCase() : 'PUBLIC';

    const privacy: Privacy = ALLOWED_PRIVACY.includes(rawPrivacy as Privacy)
      ? (rawPrivacy as Privacy)
      : ('PUBLIC' as Privacy);

    // Owner / auth
    const ownerId = await extractOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({ error: 'Authentication required to create rooms' });
    }

    // Validate map template: if provided, must exist; otherwise pick a default map template
    let resolvedMapTemplateId = mapTemplateId;
    if (resolvedMapTemplateId) {
      const mt = await prisma.mapTemplate.findUnique({ where: { id: resolvedMapTemplateId } });
      if (!mt) {
        return res.status(400).json({ error: 'Provided mapTemplateId does not exist' });
      }
    } else {
      // pick first available map template as default
      const firstMap = await prisma.mapTemplate.findFirst();
      if (!firstMap) {
        return res.status(400).json({
          error:
            'No map templates available. Create at least one MapTemplate before creating rooms.',
        });
      }
      resolvedMapTemplateId = firstMap.id;
    }

    // Slug generation
    const baseSlug =
      rawSlug && rawSlug.length > 0
        ? rawSlug
        : `${rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').slice(
            0,
            50
          )}-${uuidv4().slice(0, 6)}`;

    const slug = await ensureUniqueSlug(baseSlug);

    // Create room and owner participant within a transaction
    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({
        data: {
          name: rawName,
          slug,
          ownerId,
          mapTemplateId: resolvedMapTemplateId!,
          privacy,
        },
      });

      // create participant so owner is marked as joined
      // Note: if you don't want auto-join, remove this block
      await tx.participant.create({
        data: {
          roomId: created.id,
          userId: ownerId,
          name: (req as any).oidc?.user?.name ?? (req as any).user?.displayName ?? 'Host',
          joinedAt: new Date(),
          role: 'OWNER',
        },
      });

      return created;
    });

    // Return 201 Created with Location header pointing to the readable room route
    res
      .status(201)
      .location(`/api/rooms/${room.slug}`)
      .json(room);
  } catch (err: any) {
    logger.error({ err }, 'createRoom failed');
    // Prisma unique constraint: slug collision race condition (should be rare)
    if (err?.code === 'P2002' && err?.meta?.target?.includes('slug')) {
      return res.status(409).json({ error: 'Room slug already exists, please try again' });
    }
    return res.status(500).json({ error: 'Failed to create room' });
  }
}

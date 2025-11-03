import * as jwt from "jsonwebtoken";
import { config } from "./config/config.js";
import { prisma } from "./db";
/**
 * signToken
 * - Creates a token (a secret pass) for a user.
 * - Call it when a user logs in.
 * - We only include the minimum info (their id and maybe username).
 */
export function signToken(userId, username) {
    // payload = the info we put into the secret pass
    const payload = {
        sub: userId,
        username,
    };
    // jwt.sign builds the token using our secret key and an expiry time
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}
/**
 * verifyToken
 * - Checks a token and returns the info inside it (the payload).
 * - Returns null if the token is bad or expired.
 * - Think: this opens the secret pass and reads the user id.
 */
export function verifyToken(token) {
    try {
        // jwt.verify throws if the token is wrong or expired
        return jwt.verify(token, config.jwtSecret);
    }
    catch {
        return null;
    }
}
/**
 * requireAuth (Express middleware)
 * - This is run on routes that need a logged-in user.
 * - It reads the "Authorization" header, checks the token, and loads the user.
 * - If anything fails, it sends a 401 error (means "not allowed / please log in").
 */
export async function requireAuth(req, res, next) {
    // 1) Read the header where the token should be:
    //    Example header: Authorization: "Bearer abc.def.ghi"
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
    }
    // 2) Extract just the token string (remove the "Bearer " part)
    const token = authHeader.slice(7);
    // 3) Verify the token and get the payload (the info inside)
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: "Invalid token" });
    }
    // 4) Find the user in the database using the id inside the token
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
        return res.status(401).json({ error: "User not found" });
    }
    // 5) Attach the user object to the request so later code can use it
    req.user = user;
    // 6) Move on to the next middleware / route handler
    next();
}

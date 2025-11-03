// s3.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config/config.js";
/**
 * s3 client
 * - This is the tool we use to talk to Amazon S3 (a place that stores files).
 * - The region and keys come from our config.
 * - Never share your keys with strangers (keep them secret!).
 */
const s3 = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId ?? "",
        secretAccessKey: config.aws.secretAccessKey ?? "",
    },
});
/**
 * uploadToS3
 * - bucket: the big box name where we store files (like "my-app-bucket")
 * - key: the filename path inside the box (like "avatars/alice.png")
 * - buffer: the file data (a Buffer is like a bag of bytes — the file's contents)
 * - contentType: optional MIME type (like "image/png" or "text/plain")
 *
 * Returns the S3 path for the uploaded file (like "s3://my-app-bucket/avatars/alice.png")
 */
export async function uploadToS3(bucket, key, buffer, contentType) {
    const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });
    try {
        // send the file to S3
        await s3.send(cmd);
        // return a simple path so callers know where the file is
        return `s3://${bucket}/${key}`;
    }
    catch (err) {
        // make the error message a little friendlier and re-throw
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`S3 upload failed: ${msg}`);
    }
}

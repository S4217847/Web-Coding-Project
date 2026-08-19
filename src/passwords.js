/**
 * Password hashing and verification helpers.
 *
 * Each password receives an independent random salt and is stored only as a
 * scrypt-derived hash. Scrypt is deliberately memory-hard, which makes bulk
 * password guessing more expensive than a fast general-purpose hash would be.
 */
import crypto from "node:crypto";

const KEY_LENGTH = 64;

export function createPasswordRecord(password) {
    const salt =
        crypto.randomBytes(16).toString("hex");

    const hash =
        crypto
            .scryptSync(password, salt, KEY_LENGTH)
            .toString("hex");

    return { salt, hash };
}

export function verifyPassword(
    password,
    passwordRecord
) {
    if (
        !passwordRecord?.salt ||
        !passwordRecord?.hash
    ) {
        return false;
    }

    const storedHash =
        Buffer.from(passwordRecord.hash, "hex");

    const suppliedHash =
        crypto.scryptSync(
            password,
            passwordRecord.salt,
            KEY_LENGTH
        );

    /*
        timingSafeEqual avoids leaking which bytes matched through comparison
        timing. Node requires equal buffer lengths, so the length guard is both
        a correctness check and part of the safe comparison.
    */
    return (
        storedHash.length === suppliedHash.length &&
        crypto.timingSafeEqual(
            storedHash,
            suppliedHash
        )
    );
}

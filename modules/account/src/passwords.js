/**
 * Password hashing and verification helpers.
 *
 * bcrypt stores the salt and hash together in one passwordHash string.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function createPasswordHash(password) {
    const salt =
        bcrypt.genSaltSync(SALT_ROUNDS);

    return bcrypt.hashSync(password, salt);
}

export function verifyPassword(
    password,
    passwordHash
) {
    if (
        typeof passwordHash !== "string" ||
        passwordHash === ""
    ) {
        return false;
    }

    return bcrypt.compareSync(
        password,
        passwordHash
    );
}

/** Non-blocking variants used by live HTTP routes. */
export function createPasswordHashAsync(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPasswordAsync(
    password,
    passwordHash
) {
    if (
        typeof passwordHash !== "string" ||
        passwordHash === ""
    ) {
        return false;
    }

    return bcrypt.compare(password, passwordHash);
}

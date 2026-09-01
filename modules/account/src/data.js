/**
 * In-memory data store and resettable demo fixtures.
 *
 * User-facing records refer to users and products by ID. Password hashes are
 * stored instead of plaintext passwords.
 * This module is intentionally non-persistent, so restarting the process resets
 * the application to its seed state.
 */
import crypto from "node:crypto";

import {
    createPasswordHash
} from "./passwords.js";

// The catalogue is a template; each reset receives its own deep clone.
const products = [
    {
        id: "peer-workshop",
        name: "Peer Coding Workshop Pass",
        category: "Workshop",
        description:
            "A Saturday peer-learning session for students who want help with HTML and CSS.",
        priceVnd: 30000,
        image: "/images/peer-workshop.jpg",
        imageAlt:
            "Students working together around laptops",
        stats: {
            wishlisted: 126,
            inCarts: 74,
            purchased: 51
        }
    },
    {
        id: "drone-field-trip",
        name: "Drone Filming Field Trip",
        category: "Field Trip",
        description:
            "A supervised afternoon session covering safe drone setup and basic campus video shots.",
        priceVnd: 120000,
        image: "/images/connect-hoodie.jpg",
        imageAlt:
            "Student in a hoodie practising outdoor drone filming",
        stats: {
            wishlisted: 89,
            inCarts: 42,
            purchased: 26
        }
    },
    {
        id: "music-night",
        name: "Student Music Night Ticket",
        category: "Event",
        description:
            "Entry to an evening of student bands, acoustic sets, and community performances.",
        priceVnd: 80000,
        image: "/images/design-market.jpg",
        imageAlt:
            "Audience members taking photos at a live music event",
        stats: {
            wishlisted: 241,
            inCarts: 168,
            purchased: 119
        }
    },
    {
        id: "photo-walk",
        name: "Campus Photography Walk",
        category: "Club Activity",
        description:
            "A beginner-friendly photo walk through campus with equipment tips from the Photography Club.",
        priceVnd: 0,
        image: "/images/photo-walk.jpg",
        imageAlt:
            "Camera and lenses prepared for a photography activity",
        stats: {
            wishlisted: 158,
            inCarts: 97,
            purchased: 82
        }
    },
    {
        id: "data-bootcamp",
        name: "Data Visualisation Bootcamp",
        category: "Short Course",
        description:
            "A practical evening session covering simple charts, dashboard planning, and presentation tips.",
        priceVnd: 95000,
        image: "/images/data-bootcamp.jpg",
        imageAlt:
            "Two students pointing at information on a laptop screen",
        stats: {
            wishlisted: 63,
            inCarts: 28,
            purchased: 17
        }
    }
];

function buildSeedData() {
    /*
        Referential invariants: every wishlist, cart, and purchase productId
        names a catalogue product, and every userId names a user. A product may
        appear at most once across one user's wishlist and cart; purchase history
        is separate and may contain repeat purchases.
    */
    return {
        users: [
            {
                id: "user-dat",
                username: "dat.pham",
                studentId: "S4221230",
                name: "Dat Pham",
                email: "s4221230@rmit.edu.vn",
                description:
                    "RMIT Connect administrator and student community organiser.",
                avatarUrl: "",
                role: "admin",
                status: "active",
                lastActiveAt:
                    "2026-08-15T08:30:00.000Z",
                passwordHash:
                    createPasswordHash(
                        "ConnectDemo!26"
                    )
            },
            {
                id: "user-jay",
                username: "jay.nguyen",
                studentId: "S4217847",
                name: "Jay Nguyen",
                email: "s4217847@rmit.edu.vn",
                description:
                    "Student member interested in workshops and campus events.",
                avatarUrl: "",
                role: "member",
                status: "active",
                lastActiveAt:
                    "2026-08-14T09:15:00.000Z",
                passwordHash:
                    createPasswordHash(
                        "StudentDemo!26"
                    )
            },
            {
                id: "user-kim",
                username: "kim.seung-uk",
                studentId: "S4028530",
                name: "Kim SeungUk",
                email: "s4028530@rmit.edu.vn",
                description:
                    "Student member whose demonstration account is locked.",
                avatarUrl: "",
                role: "member",
                status: "locked",
                lastActiveAt:
                    "2026-08-09T03:45:00.000Z",
                passwordHash:
                    createPasswordHash(
                        "LockedDemo!26"
                    )
            }
        ],

        products: structuredClone(products),

        wishlist: [
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "peer-workshop",
                status: "saved",
                createdAt:
                    "2026-08-10T08:00:00.000Z",
                updatedAt:
                    "2026-08-10T08:00:00.000Z"
            },
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "drone-field-trip",
                status: "saved",
                createdAt:
                    "2026-08-10T08:10:00.000Z",
                updatedAt:
                    "2026-08-10T08:10:00.000Z"
            },
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "photo-walk",
                status: "saved",
                createdAt:
                    "2026-08-10T08:30:00.000Z",
                updatedAt:
                    "2026-08-10T08:30:00.000Z"
            }
        ],

        cart: [
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "music-night",
                status: "cart",
                quantity: 1,
                createdAt:
                    "2026-08-10T08:20:00.000Z",
                updatedAt:
                    "2026-08-11T09:00:00.000Z"
            }
        ],

        purchases: [
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "peer-workshop",
                purchasedAt:
                    "2026-07-24T04:30:00.000Z"
            },
            {
                id: crypto.randomUUID(),
                userId: "user-dat",
                productId: "photo-walk",
                purchasedAt:
                    "2026-07-12T03:15:00.000Z"
            }
        ]
    };
}

export const dataStore = {
    users: [],
    products: [],
    wishlist: [],
    cart: [],
    purchases: []
};

/*
    Replace each top-level collection rather than mutating seed templates. Tests
    can call resetData() to discard previous requests and begin from a known state.
*/
export function resetData() {
    const freshData = buildSeedData();

    dataStore.users = freshData.users;
    dataStore.products = freshData.products;
    dataStore.wishlist = freshData.wishlist;
    dataStore.cart = freshData.cart;
    dataStore.purchases = freshData.purchases;

    return dataStore;
}

resetData();

/*
    Wishlist controller: server-authoritative reads and mutations, accessible
    confirmation, summary updates, and safe saved/purchased card rendering.
*/

import {
    apiRequest
} from "./api.js";

import {
    byId,
    createElement,
    formatPrice,
    makeEmptyState,
    normaliseProduct,
    setMessage
} from "./ui.js";

import {
    initialiseShell
} from "./shell.js";

/* Page state and DOM references; no wishlist records are persisted client-side. */

const list =
    byId("wishlistList");

const purchasesList =
    byId("purchasedList");

const pageMessage =
    byId("wishlistMessage");

const savedSummary =
    byId("summarySaved");

const cartSummary =
    byId("summaryCart");

const purchasedSummary =
    byId("summaryPurchased");

let hasFocusedTarget = false;

/* Shared card helpers. */

function slugify(value) {
    return String(value)
        .toLowerCase()
        .trim()
        .replace(
            /[^a-z0-9]+/g,
            "-"
        )
        .replace(
            /(^-|-$)/g,
            ""
        );
}

function makeStats(product) {
    const listElement =
        createElement(
            "dl",
            {
                className: "itemStats"
            }
        );

    const statistics = [
        [
            "Wishlisted",
            product.wishlisted
        ],
        [
            "In carts",
            product.inCarts
        ],
        [
            "Purchased",
            product.purchased
        ]
    ];

    for (
        const [label, value]
        of statistics
    ) {
        const group =
            createElement("div");

        group.append(
            createElement(
                "dt",
                { text: label }
            ),

            createElement(
                "dd",
                { text: value }
            )
        );

        listElement.append(group);
    }

    return listElement;
}

function makeActionButton(
    text,
    className,
    testId,
    ariaLabel,
    handler
) {
    const button = createElement(
        "button",
        {
            className,
            text,

            attributes: {
                type: "button",

                "data-testid":
                    testId,

                "aria-label":
                    ariaLabel
            }
        }
    );

    button.addEventListener(
        "click",
        () => handler(button)
    );

    return button;
}

/*
    Server mutations and confirmation behaviour.
    PATCH moves or purchases an item; DELETE removes it after confirmation.
*/

async function performAction(
    product,
    method,
    action,
    confirmation,
    successMessage,
    button
) {
    if (
        confirmation &&
        !window.confirm(confirmation)
    ) {
        setMessage(
            pageMessage,
            `No changes were made to ${product.name}.`,
            "info"
        );

        return;
    }

    const article =
        button.closest(
            ".wishlistItem"
        );

    const actionButtons =
        article
            ? [
                ...article.querySelectorAll(
                    ".itemActions button"
                )
            ]
            : [button];

    const originalText =
        button.textContent;

    for (
        const control
        of actionButtons
    ) {
        control.disabled = true;
    }

    button.textContent =
        "Updating…";

    button.setAttribute(
        "aria-busy",
        "true"
    );

    article?.setAttribute(
        "aria-busy",
        "true"
    );

    setMessage(
        pageMessage,
        `Updating ${product.name}…`,
        "info"
    );

    try {
        const options = {
            method
        };

        if (action) {
            options.body =
                JSON.stringify({
                    action
                });
        }

        await apiRequest(
            `/api/wishlist/${
                encodeURIComponent(
                    product.id
                )
            }`,
            options
        );

        setMessage(
            pageMessage,
            successMessage,
            "success"
        );

        /*
            Reload from the server so its state remains
            authoritative after every mutation.
        */
        await loadWishlist(false);
    } catch (error) {
        setMessage(
            pageMessage,

            error.message ||
                "The wishlist could not be updated.",

            "error"
        );
    } finally {
        if (
            article?.isConnected
        ) {
            article.removeAttribute(
                "aria-busy"
            );
        }

        for (
            const control
            of actionButtons
        ) {
            if (control.isConnected) {
                control.disabled = false;
            }
        }

        if (button.isConnected) {
            button.textContent =
                originalText;

            button.removeAttribute(
                "aria-busy"
            );
        }
    }
}

/* Saved and cart cards. */

function makeWishlistItem(
    entry,
    state
) {
    const product =
        normaliseProduct(entry);

    const article = createElement(
        "article",
        {
            className: "wishlistItem",

            attributes: {
                id:
                    `saved-${
                        slugify(
                            product.id
                        )
                    }`,

                "data-testid":
                    `wishlist-item-${
                        product.id
                    }`
            }
        }
    );

    const image = createElement(
        "img",
        {
            className: "itemImage",

            attributes: {
                src:
                    product.image ||
                    "images/data-bootcamp.jpg",

                alt:
                    product.imageAlt ||
                    `${product.name} campus item`,

                loading: "lazy"
            }
        }
    );

    const content = createElement(
        "div",
        {
            className: "itemContent"
        }
    );

    const topLine = createElement(
        "div",
        {
            className: "itemTopLine"
        }
    );

    const stateText =
        state === "cart"
            ? "Ready for cart"
            : "Saved for later";

    topLine.append(
        createElement(
            "span",
            {
                className:
                    "itemCategory",

                text:
                    product.category
            }
        ),

        createElement(
            "span",
            {
                className:
                    state === "cart"
                        ? "itemState cartState"
                        : "itemState",

                text:
                    stateText
            }
        )
    );

    const title =
        createElement("h3");

    title.append(
        createElement(
            "a",
            {
                text:
                    product.name,

                attributes: {
                    href:
                        `wishlist-add.html#item-${
                            slugify(
                                product.id
                            )
                        }`
                }
            }
        )
    );

    const actions = createElement(
        "div",
        {
            className: "itemActions"
        }
    );

    if (state !== "cart") {
        actions.append(
            makeActionButton(
                "Move to Cart",
                "primaryButton",

                `move-to-cart-${
                    product.id
                }`,

                `Move ${product.name} to cart`,

                (button) =>
                    performAction(
                        product,
                        "PATCH",
                        "move-to-cart",
                        "",
                        `${product.name} is ready for your cart.`,
                        button
                    )
            )
        );
    }

    actions.append(
        makeActionButton(
            "Mark Purchased",
            "secondaryButton",

            `mark-purchased-${
                product.id
            }`,

            `Mark ${product.name} as purchased`,

            (button) =>
                performAction(
                    product,
                    "PATCH",
                    "mark-purchased",

                    `Mark ${product.name} as purchased?`,

                    `${product.name} was marked as purchased.`,
                    button
                )
        ),

        makeActionButton(
            "Remove",
            "textButton",

            `remove-product-${
                product.id
            }`,

            `Remove ${product.name} from wishlist`,

            (button) =>
                performAction(
                    product,
                    "DELETE",
                    "",

                    `Remove ${product.name} from your wishlist?`,

                    `${product.name} was removed from your wishlist.`,
                    button
                )
        )
    );

    content.append(
        topLine,
        title,

        createElement(
            "p",
            {
                className:
                    "itemDescription",

                text:
                    product.description
            }
        ),

        createElement(
            "p",
            {
                className:
                    "itemPrice",

                text:
                    formatPrice(product)
            }
        ),

        makeStats(product),
        actions
    );

    article.append(
        image,
        content
    );

    return article;
}

/* Purchased and favourite cards. */

function makePurchaseLine(entry) {
    const paragraph =
        createElement("p");

    const rawDate =
        entry.purchasedAt ??
        entry.purchaseDate;

    if (!rawDate) {
        paragraph.textContent =
            "Previously purchased";

        return paragraph;
    }

    const date =
        new Date(rawDate);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        paragraph.textContent =
            "Previously purchased";

        return paragraph;
    }

    const formattedDate =
        new Intl.DateTimeFormat(
            "en-AU",
            {
                dateStyle: "medium"
            }
        ).format(date);

    paragraph.append(
        "Purchased ",

        createElement(
            "time",
            {
                text:
                    formattedDate,

                attributes: {
                    datetime:
                        date.toISOString()
                }
            }
        )
    );

    return paragraph;
}

function makePurchasedItem(entry) {
    const product =
        normaliseProduct(entry);

    const article = createElement(
        "article",
        {
            className:
                "purchasedItem",

            attributes: {
                "data-testid":
                    `purchased-item-${
                        product.id
                    }`
            }
        }
    );

    const image = createElement(
        "img",
        {
            attributes: {
                src:
                    product.image ||
                    "images/data-bootcamp.jpg",

                /*
                    The adjacent heading already announces
                    the product name, so this image is decorative.
                */
                alt: "",

                loading: "lazy"
            }
        }
    );

    const content =
        createElement("div");

    content.append(
        createElement(
            "h3",
            {
                text:
                    product.name
            }
        ),

        makePurchaseLine(entry),

        createElement(
            "a",
            {
                text:
                    "View item and buy again",

                attributes: {
                    href:
                        `wishlist-add.html#item-${
                            slugify(
                                product.id
                            )
                        }`
                }
            }
        )
    );

    article.append(
        image,
        content
    );

    return article;
}

/* Rendering and server reads; each mutation reloads this authoritative snapshot. */

function renderSummary(
    summary,
    wishlist,
    cart,
    purchases
) {
    savedSummary.textContent =
        summary.saved ??
        summary.wishlist ??
        summary.savedItems ??
        (
            wishlist.length +
            cart.length
        );

    cartSummary.textContent =
        summary.cart ??
        summary.readyForCart ??
        cart.length;

    purchasedSummary.textContent =
        summary.purchased ??
        purchases.length;
}

function focusDeepLinkedItem() {
    if (
        hasFocusedTarget ||
        !location.hash.startsWith(
            "#saved-"
        )
    ) {
        return;
    }

    let targetId;

    try {
        targetId =
            decodeURIComponent(
                location.hash.slice(1)
            );
    } catch {
        return;
    }

    const target =
        document.getElementById(
            targetId
        );

    if (!target) {
        return;
    }

    hasFocusedTarget = true;
    target.tabIndex = -1;

    requestAnimationFrame(() => {
        target.focus();
    });
}

async function loadWishlist(
    showLoading = true
) {
    list.setAttribute(
        "aria-busy",
        "true"
    );

    purchasesList.setAttribute(
        "aria-busy",
        "true"
    );

    if (showLoading) {
        list.replaceChildren(
            createElement(
                "p",
                {
                    className:
                        "loadingState",

                    text:
                        "Loading your wishlist…"
                }
            )
        );

        purchasesList.replaceChildren(
            createElement(
                "p",
                {
                    className:
                        "loadingState",

                    text:
                        "Loading recent purchases…"
                }
            )
        );
    }

    try {
        const data =
            await apiRequest(
                "/api/wishlist"
            );

        const combinedItems =
            Array.isArray(data.items)
                ? data.items
                : [];

        const wishlist =
            Array.isArray(
                data.wishlist
            )
                ? data.wishlist
                : combinedItems.filter(
                    (entry) =>
                        String(
                            entry.status
                        ).toLowerCase() !==
                        "cart"
                );

        const cart =
            Array.isArray(data.cart)
                ? data.cart
                : combinedItems.filter(
                    (entry) =>
                        String(
                            entry.status
                        ).toLowerCase() ===
                        "cart"
                );

        const purchases =
            Array.isArray(
                data.purchases
            )
                ? data.purchases
                : [];

        const activeItems = [
            ...wishlist.map(
                (entry) =>
                    makeWishlistItem(
                        entry,
                        "saved"
                    )
            ),

            ...cart.map(
                (entry) =>
                    makeWishlistItem(
                        entry,
                        "cart"
                    )
            )
        ];

        list.replaceChildren();
        purchasesList.replaceChildren();

        if (activeItems.length > 0) {
            list.append(
                ...activeItems
            );
        } else {
            list.append(
                makeEmptyState(
                    "Your wishlist is empty",
                    "Browse campus items and save something useful for later."
                )
            );
        }

        if (purchases.length > 0) {
            purchasesList.append(
                ...purchases.map(
                    makePurchasedItem
                )
            );
        } else {
            purchasesList.append(
                makeEmptyState(
                    "No recent purchases",
                    "Items marked as purchased will appear here as favourites to revisit."
                )
            );
        }

        renderSummary(
            data.summary || {},
            wishlist,
            cart,
            purchases
        );

        focusDeepLinkedItem();
    } catch (error) {
        list.replaceChildren(
            makeEmptyState(
                "Wishlist unavailable",
                "Refresh the page or try again later."
            )
        );

        purchasesList.replaceChildren(
            makeEmptyState(
                "Purchases unavailable",
                "Recent purchases could not be loaded."
            )
        );

        setMessage(
            pageMessage,

            error.message ||
                "Your wishlist could not be loaded.",

            "error"
        );
    } finally {
        list.setAttribute(
            "aria-busy",
            "false"
        );

        purchasesList.setAttribute(
            "aria-busy",
            "false"
        );
    }
}

/* Authentication and initial load. */

async function initialisePage() {
    const user =
        await initialiseShell({
            requireLogin: true
        });

    if (user) {
        await loadWishlist();
    }
}

initialisePage();

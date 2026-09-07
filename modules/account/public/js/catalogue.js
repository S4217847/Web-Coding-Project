/*
    Browse Items controller: one authenticated product read, client-side
    validation/filter/sort, safe card rendering, and wishlist creation.
*/

import {
    ApiError,
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

/*
    Page state and DOM references.
    Products come from the API once; sessionStorage holds filter preferences only.
*/

const FILTER_KEY =
    "rmitConnect.catalogueFilters";

const form =
    byId("catalogueFilters");

const searchInput =
    byId("catalogueSearch");

const categorySelect =
    byId("catalogueCategory");

const statusSelect =
    byId("catalogueStatus");

const sortSelect =
    byId("catalogueSort");

const resetButton =
    byId("resetFilters");

const grid =
    byId("catalogueGrid");

const resultCount =
    byId("catalogueResultCount");

const pageMessage =
    byId("catalogueMessage");

const savedCount =
    byId("savedItemCount");

const searchError =
    byId("catalogueSearchError");

let products = [];
let hasFocusedTarget = false;

/* Validation and saved filter state. */

function optionExists(select, value) {
    return [...select.options].some(
        (option) =>
            option.value === value
    );
}

function restoredOption(
    select,
    value,
    fallback
) {
    return optionExists(select, value)
        ? value
        : fallback;
}

function validateSearch() {
    const length =
        searchInput.value.trim().length;

    const message =
        length === 1
            ? "Enter at least 2 characters, or clear the search."
            : "";

    searchError.textContent = message;
    searchError.hidden = !message;

    if (message) {
        searchInput.setAttribute(
            "aria-invalid",
            "true"
        );
    } else {
        searchInput.removeAttribute(
            "aria-invalid"
        );
    }

    return !message;
}

function restoreFilters() {
    try {
        const savedValue =
            sessionStorage.getItem(
                FILTER_KEY
            );

        const filters =
            savedValue
                ? JSON.parse(savedValue)
                : {};

        searchInput.value =
            typeof filters.search === "string"
                ? filters.search.slice(0, 80)
                : "";

        categorySelect.value =
            restoredOption(
                categorySelect,
                filters.category,
                "all"
            );

        statusSelect.value =
            restoredOption(
                statusSelect,
                filters.status,
                "all"
            );

        sortSelect.value =
            restoredOption(
                sortSelect,
                filters.sort,
                "popular"
            );
    } catch {
        try {
            sessionStorage.removeItem(
                FILTER_KEY
            );
        } catch {
            // Storage is optional.
        }
    }

    const querySearch =
        new URLSearchParams(
            location.search
        ).get("q");

    if (querySearch !== null) {
        searchInput.value =
            querySearch
                .trim()
                .slice(0, 80);
    }

    /*
        A deep-linked product must not be concealed
        by filters left over from an earlier visit.
    */
    if (
        location.hash.startsWith(
            "#item-"
        )
    ) {
        searchInput.value = "";
        categorySelect.value = "all";
        statusSelect.value = "all";
    }
}

function saveFilters() {
    try {
        sessionStorage.setItem(
            FILTER_KEY,
            JSON.stringify({
                search:
                    searchInput.value,

                category:
                    categorySelect.value,

                status:
                    statusSelect.value,

                sort:
                    sortSelect.value
            })
        );
    } catch {
        // Filtering still works without storage.
    }
}

/* Safe DOM construction. */

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
    const list = createElement(
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

        list.append(group);
    }

    return list;
}

function makeProductCard(product) {
    const article = createElement(
        "article",
        {
            className: "catalogueItem",

            attributes: {
                id:
                    `item-${
                        slugify(product.id)
                    }`,

                "data-testid":
                    `product-card-${
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
            className:
                "catalogueContent"
        }
    );

    const topLine = createElement(
        "div",
        {
            className: "itemTopLine"
        }
    );

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
                    "itemPrice",

                text:
                    formatPrice(product)
            }
        )
    );

    const button = createElement(
        "button",
        {
            className:
                product.isWishlisted
                    ? "disabledButton"
                    : "primaryButton fullButton",

            text:
                product.isWishlisted
                    ? "Already in Wishlist"
                    : "Add to Wishlist",

            attributes: {
                type: "button",

                "data-testid":
                    `add-product-${
                        product.id
                    }`,

                "aria-label":
                    product.isWishlisted
                        ? `${product.name} is already in the wishlist`
                        : `Add ${product.name} to wishlist`
            }
        }
    );

    button.disabled =
        product.isWishlisted;

    /* POST creates one wishlist record; duplicate responses remain idempotent in UI. */

    button.addEventListener(
        "click",
        async () => {
            button.disabled = true;
            button.textContent =
                "Adding…";

            setMessage(pageMessage);

            try {
                await apiRequest(
                    "/api/wishlist",
                    {
                        method: "POST",

                        body:
                            JSON.stringify({
                                productId:
                                    product.id
                            })
                    }
                );

                product.isWishlisted = true;
                product.wishlisted += 1;

                setMessage(
                    pageMessage,
                    `${product.name} was added to your wishlist.`,
                    "success"
                );

                renderProducts();
                updateSavedCount();
            } catch (error) {
                if (
                    error instanceof
                        ApiError &&

                    error.code ===
                        "DUPLICATE_WISHLIST_ITEM"
                ) {
                    product.isWishlisted = true;

                    setMessage(
                        pageMessage,
                        `${product.name} is already in your wishlist.`,
                        "info"
                    );

                    renderProducts();
                    updateSavedCount();
                } else {
                    button.disabled = false;
                    button.textContent =
                        "Add to Wishlist";

                    setMessage(
                        pageMessage,

                        error.message ||
                            "The item could not be added.",

                        "error"
                    );
                }
            }
        }
    );

    content.append(
        topLine,

        createElement(
            "h3",
            {
                text: product.name
            }
        ),

        createElement(
            "p",
            {
                className:
                    "catalogueDescription",

                text:
                    product.description
            }
        ),

        makeStats(product),
        button
    );

    if (product.isWishlisted) {
        content.append(
            createElement(
                "p",
                {
                    className:
                        "duplicateNote",

                    text:
                        "Duplicate prevented: this item is already saved once."
                }
            )
        );
    }

    article.append(
        image,
        content
    );

    return article;
}

/*
    All search, filtering, and sorting below is
    intentionally performed in the browser.
*/

/* Pure client-side filtering and sorting never mutate the source collection. */

function filteredProducts() {
    const search =
        searchInput.value
            .trim()
            .toLowerCase();

    const category =
        categorySelect.value;

    const status =
        statusSelect.value;

    const filtered =
        products.filter(
            (product) => {
                const searchable =
                    `${
                        product.name
                    } ${
                        product.category
                    } ${
                        product.description
                    }`.toLowerCase();

                const categoryMatches =
                    category === "all" ||
                    slugify(
                        product.category
                    ) === category;

                const statusMatches =
                    status === "all" ||
                    (
                        status === "saved" &&
                        product.isWishlisted
                    ) ||
                    (
                        status === "available" &&
                        !product.isWishlisted
                    );

                return (
                    searchable.includes(
                        search
                    ) &&
                    categoryMatches &&
                    statusMatches
                );
            }
        );

    const sorters = {
        popular: (a, b) =>
            b.wishlisted -
            a.wishlisted,

        "price-low": (a, b) =>
            Number(a.price) -
            Number(b.price),

        "price-high": (a, b) =>
            Number(b.price) -
            Number(a.price),

        purchased: (a, b) =>
            b.purchased -
            a.purchased,

        name: (a, b) =>
            a.name.localeCompare(
                b.name
            )
    };

    return filtered.sort(
        sorters[sortSelect.value] ||
        sorters.popular
    );
}

function updateSavedCount() {
    savedCount.textContent =
        products.filter(
            (product) =>
                product.isWishlisted
        ).length;
}

function focusDeepLinkedCard() {
    if (
        hasFocusedTarget ||
        !location.hash.startsWith(
            "#item-"
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

/* Rebuild cards from trusted state with DOM APIs rather than HTML strings. */

function renderProducts() {
    if (!validateSearch()) {
        grid.replaceChildren(
            makeEmptyState(
                "Search needs more detail",
                "Enter at least 2 characters, or clear the search."
            )
        );

        resultCount.textContent =
            "Search needs attention";

        return false;
    }

    saveFilters();

    const visibleProducts =
        filteredProducts();

    grid.replaceChildren();

    if (visibleProducts.length === 0) {
        grid.append(
            makeEmptyState(
                "No items match those filters",
                "Try another keyword, category, or reset the filters."
            )
        );
    } else {
        grid.append(
            ...visibleProducts.map(
                makeProductCard
            )
        );
    }

    resultCount.textContent =
        `${visibleProducts.length} ${
            visibleProducts.length === 1
                ? "item"
                : "items"
        } shown`;

    focusDeepLinkedCard();

    return true;
}

/* Events and the initial server request. */

form.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();

        if (!renderProducts()) {
            searchInput.focus();
        }
    }
);

searchInput.addEventListener(
    "input",
    renderProducts
);

for (
    const select of [
        categorySelect,
        statusSelect,
        sortSelect
    ]
) {
    select.addEventListener(
        "change",
        renderProducts
    );
}

resetButton.addEventListener(
    "click",
    () => {
        form.reset();

        try {
            sessionStorage.removeItem(
                FILTER_KEY
            );
        } catch {
            // Storage is optional.
        }

        renderProducts();
        searchInput.focus();
    }
);

async function initialisePage() {
    const user =
        await initialiseShell({
            requireLogin: true
        });

    if (!user) {
        return;
    }

    restoreFilters();

    try {
        /*
            This is the only product-list request.
            Every filter and sort afterward is local.
        */
        const data =
            await apiRequest(
                "/api/products"
            );

        products =
            (data.products || [])
                .map(normaliseProduct);

        renderProducts();
        updateSavedCount();
    } catch (error) {
        grid.replaceChildren(
            makeEmptyState(
                "Catalogue unavailable",
                "Refresh the page or try again later."
            )
        );

        resultCount.textContent =
            "0 items shown";

        setMessage(
            pageMessage,

            error.message ||
                "The catalogue could not be loaded.",

            "error"
        );
    } finally {
        grid.setAttribute(
            "aria-busy",
            "false"
        );
    }
}

initialisePage();

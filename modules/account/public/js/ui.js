/*
    Stateless DOM, feedback, and product-normalisation helpers.
    Feature modules own state; these helpers only apply shared UI contracts.
*/

export function byId(id) {
    return document.getElementById(id);
}

export function setMessage(
    element,
    message = "",
    type = "info"
) {
    if (!element) {
        return;
    }

    element.textContent = message;

    element.classList.remove(
        "notice--success",
        "notice--error",
        "notice--info"
    );

    element.classList.add("notice");

    if (message) {
        element.classList.add(
            `notice--${type}`
        );
    }

    element.hidden = !message;
    element.setAttribute(
        "role",
        type === "error" ? "alert" : "status"
    );
}

export function clearFieldErrors(form) {
    for (const error of form.querySelectorAll(".fieldError")) {
        error.textContent = "";
        error.hidden = true;
    }

    for (
        const field of
        form.querySelectorAll("[aria-invalid='true']")
    ) {
        field.removeAttribute("aria-invalid");
    }
}

export function showFieldError(
    form,
    fieldName,
    message
) {
    const field = form.elements.namedItem(fieldName);
    const error = form.querySelector(
        `[data-error-for="${fieldName}"]`
    );

    if (field instanceof HTMLElement) {
        field.setAttribute("aria-invalid", "true");
    }

    if (error) {
        error.textContent = message;
        error.hidden = false;
    }
}

export function showServerFieldErrors(
    form,
    fields = {}
) {
    for (
        const [fieldName, message]
        of Object.entries(fields)
    ) {
        showFieldError(
            form,
            fieldName,
            Array.isArray(message) ? message[0] : message
        );
    }
}

export function setBusy(
    button,
    busy,
    busyText = "Working…"
) {
    if (!button) {
        return;
    }

    if (busy) {
        button.dataset.originalText =
            button.textContent;

        button.textContent = busyText;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
    } else {
        button.textContent =
            button.dataset.originalText ||
            button.textContent;

        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}

/*
    Safe DOM and product helpers shared by dynamic pages.
    Text is assigned with textContent, never interpreted as HTML.
*/

export function createElement(
    tagName,
    options = {}
) {
    const element =
        document.createElement(tagName);

    if (options.className) {
        element.className =
            options.className;
    }

    if (options.text !== undefined) {
        element.textContent =
            String(options.text);
    }

    if (options.attributes) {
        for (
            const [name, value]
            of Object.entries(
                options.attributes
            )
        ) {
            if (
                value !== undefined &&
                value !== null &&
                value !== false
            ) {
                element.setAttribute(
                    name,
                    value === true
                        ? ""
                        : String(value)
                );
            }
        }
    }

    return element;
}

export function formatPrice(product) {
    if (
        typeof product.priceFormatted ===
        "string"
    ) {
        return product.priceFormatted;
    }

    const value = Number(
        product.price ??
        product.priceVnd ??
        product.priceInVnd ??
        0
    );

    if (value === 0) {
        return "Free";
    }

    return `${
        new Intl.NumberFormat(
            "en-US"
        ).format(value)
    } VND`;
}

export function normaliseProduct(entry) {
    /*
        Wishlist responses contain a wrapper record
        and a nested product. Product details should win.
    */
    const product = entry?.product
        ? {
            ...entry,
            ...entry.product
        }
        : { ...entry };

    const stats =
        product.stats || {};

    product.id =
        product.id ??
        product.productId ??
        product.slug;

    product.name =
        product.name ??
        product.title ??
        "Unnamed item";

    product.category =
        product.category ??
        "Campus item";

    product.description =
        product.description ??
        "No description is available.";

    product.image =
        product.image ??
        product.imageUrl ??
        product.imagePath ??
        "";

    product.price =
        product.price ??
        product.priceVnd ??
        product.priceInVnd ??
        0;

    product.wishlisted = Number(
        product.wishlisted ??
        product.wishlistCount ??
        stats.wishlisted ??
        0
    );

    product.inCarts = Number(
        product.inCarts ??
        product.cartCount ??
        stats.inCarts ??
        0
    );

    product.purchased = Number(
        product.purchased ??
        product.purchaseCount ??
        stats.purchased ??
        0
    );

    product.isWishlisted = Boolean(
        product.isWishlisted ??
        product.inWishlist ??
        product.saved ??
        false
    );

    return product;
}

export function makeEmptyState(
    title,
    detail
) {
    const wrapper = createElement(
        "div",
        {
            className: "emptyState"
        }
    );

    wrapper.append(
        createElement(
            "h3",
            { text: title }
        ),

        createElement(
            "p",
            { text: detail }
        )
    );

    return wrapper;
}

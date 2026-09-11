const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "public", "js", "discussion.js"),
  "utf8",
);

// A small DOM fixture exercises the real controller without adding a library.
function openForum(
  userId,
  storage,
  clearDraft = false,
  productSlugs = ["peer-workshop"],
  contextProductSlug = "",
  reviewEntries = [
    {
      databaseId: "66cc00000000000000000001",
      courseCode: "COSC1076",
      title: "Best intro course",
    },
  ],
) {
  const elements = new Map();
  const postProductResultItems = [];
  const postReviewResultItems = [];

  function element(id) {
    if (!elements.has(id)) {
      const attributes = new Map();
      const classes = new Set(["postbox-hidden"]);
      elements.set(id, {
        value: "",
        hidden: false,
        textContent: "",
        listeners: {},
        getAttribute(name) { return attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, value); },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        appendChild() {},
        focus() {},
        scrollIntoView() {},
        querySelector() { return null; },
        classList: {
          contains(name) { return classes.has(name); },
          toggle(name) {
            if (classes.has(name)) classes.delete(name);
            else classes.add(name);
          },
          remove(name) { classes.delete(name); },
        },
      });
    }
    return elements.get(id);
  }

  element("post-form").setAttribute("data-user-id", userId);
  element("post-form").setAttribute("data-clear-draft", String(clearDraft));
  element("post-product-search-panel").hidden = true;
  element("post-review-search-panel").hidden = true;

  if (contextProductSlug !== "") {
    element("show-post-form-button").setAttribute(
      "data-context-product-slug",
      contextProductSlug,
    );
  }

  for (let i = 0; i < productSlugs.length; i += 1) {
    const productButton = element("product-button-" + i);
    productButton.setAttribute("data-product-slug", productSlugs[i]);
    productButton.setAttribute("data-product-display-name", productSlugs[i]);
    const resultItem = element("product-result-" + i);
    resultItem.setAttribute("data-product-name", productSlugs[i]);
    resultItem.querySelector = function () { return productButton; };
    postProductResultItems.push(resultItem);
  }

  for (let i = 0; i < reviewEntries.length; i += 1) {
    const reviewButton = element("review-button-" + i);
    reviewButton.setAttribute("data-review-id", reviewEntries[i].databaseId);
    reviewButton.setAttribute(
      "data-review-course-code",
      reviewEntries[i].courseCode,
    );
    reviewButton.setAttribute("data-review-title", reviewEntries[i].title);
    const resultItem = element("review-result-" + i);
    resultItem.setAttribute(
      "data-review-search",
      (reviewEntries[i].courseCode + " " + reviewEntries[i].title).toLowerCase(),
    );
    resultItem.querySelector = function () { return reviewButton; };
    postReviewResultItems.push(resultItem);
  }

  vm.runInNewContext(source, {
    document: {
      getElementById(id) {
        if (id === "discussion-filter-form") return null;
        return element(id);
      },
      querySelector: element,
      querySelectorAll(selector) {
        if (selector === "[data-open-post-form]") {
          return [element("show-post-form-button")];
        }

        if (selector === "#post-product-results li") {
          return postProductResultItems;
        }

        if (selector === "#post-review-results li") {
          return postReviewResultItems;
        }

        return [];
      },
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
  });

  return {
    element,
    type(id, value) {
      element(id).value = value;
      element(id).listeners.input();
    },
    select(id, value) {
      if (value === "") {
        element("clear-post-product").listeners.click();
        return;
      }

      for (let i = 0; i < postProductResultItems.length; i += 1) {
        const productButton = postProductResultItems[i].querySelector("button");

        if (productButton.getAttribute("data-product-slug") === value) {
          productButton.listeners.click();
        }
      }
    },
    selectReview(value) {
      if (value === "") {
        element("clear-post-review").listeners.click();
        return;
      }

      for (let i = 0; i < postReviewResultItems.length; i += 1) {
        const reviewButton = postReviewResultItems[i].querySelector("button");

        if (reviewButton.getAttribute("data-review-id") === value) {
          reviewButton.listeners.click();
        }
      }
    },
    click(id) {
      element(id).listeners.click();
    },
  };
}

test("Forum restores the same account's draft after a reload", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's draft title");
  dat.type("post-content", "Dat's unfinished discussion.");
  dat.select("product-slug", "peer-workshop");
  dat.selectReview("66cc00000000000000000001");
  const reloaded = openForum("dat-id", storage);
  assert.equal(reloaded.element("post-title").value, "Dat's draft title");
  assert.equal(reloaded.element("post-content").value, "Dat's unfinished discussion.");
  assert.equal(reloaded.element("product-slug").value, "peer-workshop");
  assert.equal(
    reloaded.element("review-id").value,
    "66cc00000000000000000001",
  );
});

test("Forum drafts stay separate when accounts share one browser", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's private draft");
  dat.type("post-content", "Only Dat should restore this text.");
  dat.select("product-slug", "peer-workshop");
  const jay = openForum("jay-id", storage);
  assert.equal(jay.element("post-title").value, "");
  assert.equal(jay.element("post-content").value, "");
  assert.equal(jay.element("product-slug").value, "");
  jay.type("post-title", "Jay's draft");
  assert.equal(openForum("dat-id", storage).element("post-title").value, "Dat's private draft");
  assert.equal(
    openForum("dat-id", storage).element("product-slug").value,
    "peer-workshop",
  );
});

test("Forum does not assign an old unowned draft to the current account", () => {
  const storage = new Map([
    ["discussionPostTitle", "Unknown account's old title"],
    ["discussionPostContent", "Unknown account's old content"],
  ]);
  const dat = openForum("dat-id", storage);
  assert.equal(dat.element("post-title").value, "");
  assert.equal(dat.element("post-content").value, "");
});

test("Forum keeps a submitted draft until the server confirms success", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Keep this title if upload fails");
  dat.type("post-content", "Keep this content if the server rejects the image.");
  dat.select("product-slug", "peer-workshop");
  dat.element("post-image").value = "selected-image.jpg";
  let prevented = false;
  dat.element("post-form").listeners.submit({
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, false);
  const retry = openForum("dat-id", storage);
  assert.equal(retry.element("post-title").value, "Keep this title if upload fails");
  assert.equal(retry.element("post-content").value, "Keep this content if the server rejects the image.");
  assert.equal(retry.element("product-slug").value, "peer-workshop");
});

test("Forum clears only the successful author's draft", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's published title");
  dat.type("post-content", "Dat's published content.");
  dat.select("product-slug", "peer-workshop");
  dat.selectReview("66cc00000000000000000001");
  const jay = openForum("jay-id", storage);
  jay.type("post-title", "Jay's unfinished title");
  const afterSuccess = openForum("dat-id", storage, true);
  assert.equal(afterSuccess.element("post-title").value, "");
  assert.equal(afterSuccess.element("post-content").value, "");
  assert.equal(afterSuccess.element("product-slug").value, "");
  assert.equal(afterSuccess.element("review-id").value, "");
  assert.equal(openForum("dat-id", storage).element("post-title").value, "");
  assert.equal(openForum("jay-id", storage).element("post-title").value, "Jay's unfinished title");
});

test("Forum removes a saved Product draft when that Product is unavailable", () => {
  const productDraftKey = "discussionProductSlug:dat-id";
  const storage = new Map([[productDraftKey, "removed-product"]]);
  const dat = openForum("dat-id", storage);

  assert.equal(dat.element("product-slug").value, "");
  assert.equal(storage.has(productDraftKey), false);
});

test("Forum removes only an unavailable Review selection from the draft", () => {
  const reviewDraftKey = "discussionReviewId:dat-id";
  const storage = new Map([
    ["discussionPostTitle:dat-id", "Keep this title"],
    ["discussionPostContent:dat-id", "Keep this content"],
    ["discussionProductSlug:dat-id", "peer-workshop"],
    [reviewDraftKey, "66cc00000000000000000999"],
  ]);
  const forum = openForum("dat-id", storage);

  assert.equal(forum.element("review-id").value, "");
  assert.equal(storage.has(reviewDraftKey), false);
  assert.equal(storage.get("discussionPostTitle:dat-id"), "Keep this title");
  assert.equal(
    storage.get("discussionPostContent:dat-id"),
    "Keep this content",
  );
  assert.equal(
    storage.get("discussionProductSlug:dat-id"),
    "peer-workshop",
  );
  assert.equal(forum.element("product-slug").value, "peer-workshop");
});

test("Product context preselects only when there is no saved draft", () => {
  const emptyStorage = new Map();
  const noDraft = openForum(
    "dat-id",
    emptyStorage,
    false,
    ["peer-workshop", "data-bootcamp"],
    "peer-workshop",
  );
  noDraft.click("show-post-form-button");
  assert.equal(noDraft.element("product-slug").value, "peer-workshop");

  const savedStorage = new Map([
    ["discussionPostTitle:dat-id", "Keep my title"],
    ["discussionPostContent:dat-id", "Keep my content"],
    ["discussionProductSlug:dat-id", "data-bootcamp"],
  ]);
  const withDraft = openForum(
    "dat-id",
    savedStorage,
    false,
    ["peer-workshop", "data-bootcamp"],
    "peer-workshop",
  );
  withDraft.click("show-post-form-button");
  assert.equal(withDraft.element("product-slug").value, "data-bootcamp");
  assert.equal(withDraft.element("product-draft-choice").hidden, false);
  assert.equal(withDraft.element("post-title").value, "Keep my title");
  assert.equal(withDraft.element("post-content").value, "Keep my content");

  withDraft.click("use-context-product");
  assert.equal(withDraft.element("product-slug").value, "peer-workshop");
  assert.equal(withDraft.element("post-title").value, "Keep my title");
  assert.equal(withDraft.element("post-content").value, "Keep my content");
});

test("Product search shows eight results and explains that more match", () => {
  const productSlugs = [];

  for (let i = 1; i <= 10; i += 1) {
    productSlugs.push("item-" + i);
  }

  const forum = openForum("dat-id", new Map(), false, productSlugs);
  forum.type("post-product-search", "item");

  let visibleCount = 0;
  for (let i = 0; i < productSlugs.length; i += 1) {
    if (!forum.element("product-result-" + i).hidden) visibleCount += 1;
  }

  assert.equal(visibleCount, 8);
  assert.equal(
    forum.element("post-product-result-message").textContent,
    "2 more items match. Narrow your search to see them.",
  );
});

test("Product picker changes only after select or remove", () => {
  const forum = openForum(
    "dat-id",
    new Map(),
    false,
    ["peer-workshop", "data-bootcamp"],
  );

  assert.equal(forum.element("post-product-search-panel").hidden, true);
  assert.equal(
    forum.element("selected-product-text").textContent,
    "No course or activity selected. You can still post.",
  );

  forum.click("choose-post-product");
  assert.equal(forum.element("post-product-search-panel").hidden, false);
  forum.type("post-product-search", "peer");
  assert.equal(forum.element("product-slug").value, "");

  forum.click("cancel-post-product-search");
  assert.equal(forum.element("post-product-search-panel").hidden, true);
  assert.equal(forum.element("product-slug").value, "");

  forum.click("choose-post-product");
  forum.select("product-slug", "peer-workshop");
  assert.equal(forum.element("post-product-search-panel").hidden, true);
  assert.equal(forum.element("product-slug").value, "peer-workshop");
  assert.equal(
    forum.element("selected-product-text").textContent,
    "Your question is about: peer-workshop",
  );

  forum.click("change-post-product");
  forum.type("post-product-search", "data");
  assert.equal(forum.element("product-slug").value, "peer-workshop");
  forum.click("cancel-post-product-search");
  assert.equal(forum.element("product-slug").value, "peer-workshop");

  forum.click("clear-post-product");
  assert.equal(forum.element("product-slug").value, "");
  assert.equal(
    forum.element("selected-product-text").textContent,
    "No course or activity selected. You can still post.",
  );
});

test("Review picker changes only after select or remove", () => {
  const firstReviewId = "66cc00000000000000000001";
  const secondReviewId = "66cc00000000000000000002";
  const reviews = [
    {
      databaseId: firstReviewId,
      courseCode: "COSC1076",
      title: "Best intro course",
    },
    {
      databaseId: secondReviewId,
      courseCode: "BUSM1228",
      title: "Good content",
    },
  ];
  const forum = openForum("dat-id", new Map(), false, ["peer-workshop"], "", reviews);

  assert.equal(forum.element("post-review-search-panel").hidden, true);
  assert.equal(forum.element("review-id").value, "");

  forum.click("choose-post-review");
  forum.type("post-review-search", "cosc");
  assert.equal(forum.element("review-id").value, "");
  forum.click("cancel-post-review-search");
  assert.equal(forum.element("review-id").value, "");

  forum.click("choose-post-review");
  forum.selectReview(firstReviewId);
  assert.equal(forum.element("post-review-search-panel").hidden, true);
  assert.equal(forum.element("review-id").value, firstReviewId);
  assert.equal(
    forum.element("selected-review-text").textContent,
    "Related review: COSC1076 · Best intro course",
  );

  forum.click("change-post-review");
  forum.type("post-review-search", "busm");
  assert.equal(forum.element("review-id").value, firstReviewId);
  forum.click("cancel-post-review-search");
  assert.equal(forum.element("review-id").value, firstReviewId);

  forum.click("clear-post-review");
  assert.equal(forum.element("review-id").value, "");
});

test("Review search shows eight results and explains that more match", () => {
  const reviews = [];

  for (let i = 1; i <= 10; i += 1) {
    reviews.push({
      databaseId: "66cc" + String(i).padStart(20, "0"),
      courseCode: "COSC" + String(1000 + i),
      title: "Shared review " + i,
    });
  }

  const forum = openForum("dat-id", new Map(), false, [], "", reviews);
  forum.type("post-review-search", "review");

  let visibleCount = 0;
  for (let i = 0; i < reviews.length; i += 1) {
    if (!forum.element("review-result-" + i).hidden) visibleCount += 1;
  }

  assert.equal(visibleCount, 8);
  assert.equal(
    forum.element("post-review-result-message").textContent,
    "2 more reviews match. Narrow your search to see them.",
  );
});

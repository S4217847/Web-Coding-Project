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
function openForum(userId, storage, clearDraft = false) {
  const elements = new Map();

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
        classList: {
          contains(name) { return classes.has(name); },
          toggle(name) {
            if (classes.has(name)) classes.delete(name);
            else classes.add(name);
          },
        },
      });
    }
    return elements.get(id);
  }

  element("post-form").setAttribute("data-user-id", userId);
  element("post-form").setAttribute("data-clear-draft", String(clearDraft));
  element("filterby").value = "title";
  element("sortby").value = "newest";

  vm.runInNewContext(source, {
    document: {
      getElementById: element,
      querySelector: element,
      querySelectorAll() { return []; },
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
  };
}

test("Forum restores the same account's draft after a reload", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's draft title");
  dat.type("post-content", "Dat's unfinished discussion.");
  const reloaded = openForum("dat-id", storage);
  assert.equal(reloaded.element("post-title").value, "Dat's draft title");
  assert.equal(reloaded.element("post-content").value, "Dat's unfinished discussion.");
});

test("Forum drafts stay separate when accounts share one browser", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's private draft");
  dat.type("post-content", "Only Dat should restore this text.");
  const jay = openForum("jay-id", storage);
  assert.equal(jay.element("post-title").value, "");
  assert.equal(jay.element("post-content").value, "");
  jay.type("post-title", "Jay's draft");
  assert.equal(openForum("dat-id", storage).element("post-title").value, "Dat's private draft");
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
  dat.element("post-image").value = "selected-image.jpg";
  let prevented = false;
  dat.element("post-form").listeners.submit({
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, false);
  const retry = openForum("dat-id", storage);
  assert.equal(retry.element("post-title").value, "Keep this title if upload fails");
  assert.equal(retry.element("post-content").value, "Keep this content if the server rejects the image.");
});

test("Forum clears only the successful author's draft", () => {
  const storage = new Map();
  const dat = openForum("dat-id", storage);
  dat.type("post-title", "Dat's published title");
  dat.type("post-content", "Dat's published content.");
  const jay = openForum("jay-id", storage);
  jay.type("post-title", "Jay's unfinished title");
  const afterSuccess = openForum("dat-id", storage, true);
  assert.equal(afterSuccess.element("post-title").value, "");
  assert.equal(afterSuccess.element("post-content").value, "");
  assert.equal(openForum("dat-id", storage).element("post-title").value, "");
  assert.equal(openForum("jay-id", storage).element("post-title").value, "Jay's unfinished title");
});

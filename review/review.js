document.addEventListener("DOMContentLoaded", function () {
  // Replace this one demo user with the group's shared login user when available.
  const currentUser = { id: "1" };
  // Page URLs and API URLs are separate so fetch() always receives JSON.
  const api = "/api/reviews";
  const getId = function () { return new URLSearchParams(location.search).get("id"); };

  function request(url, options) {
    return fetch(url, options).then(function (response) {
      if (response.status === 204) return null;
      return response.json().then(function (data) {
        if (!response.ok) {
          const error = new Error(data.error || "The request could not be completed.");
          error.fields = data.errors;
          throw error;
        }
        return data;
      });
    });
  }

  function text(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  }

  // Build review content safely and preserve the Assessment 1 CSS classes.
  function reviewCard(review) {
    const article = text("article", "reviewListItem", "");
    const imageCell = text("div", "reviewThumbnailCell", "");
    const image = document.createElement("img");
    image.className = "reviewThumbnail";
    image.src = review.imageUrl;
    image.alt = "Thumbnail for " + review.title;
    imageCell.appendChild(image);
    const content = text("div", "reviewListContentCell", "");
    const heading = text("h3", "reviewListTitle", "");
    const title = text("a", "", review.title);
    title.href = "/review/review-detail.html?id=" + review.id;
    heading.appendChild(title);
    const meta = text("p", "reviewListMeta", "");
    const stars = text("span", "stars", "★".repeat(review.rating));
    stars.setAttribute("aria-label", review.rating + " out of 5 stars");
    meta.append(stars, text("span", "", review.reviewerName), text("span", "", "Added " + review.createdAt));
    content.append(heading, text("p", "reviewListSummary", review.description.slice(0, 140)), meta);
    const actions = text("div", "reviewListActionsCell", "");
    function action(label, className, href) {
      const link = text("a", className, label);
      link.href = href;
      actions.appendChild(link);
      return link;
    }
    action("View", "actionView", "/review/review-detail.html?id=" + review.id);
    if (String(review.userId) === currentUser.id) {
      action("Edit", "actionEdit", "/review/review-edit.html?id=" + review.id);
      const remove = action("Delete", "actionDelete", "#");
      remove.dataset.reviewId = review.id;
    }
    article.append(imageCell, content, actions);
    return article;
  }

  function listMessage(list, message) { list.replaceChildren(text("li", "", message)); }

  const form = document.querySelector(".reviewForm");
  if (form) {
    const titleInput = form.querySelector("#reviewTitle");
    const descriptionInput = form.querySelector("#reviewDescription");
    const ratingInput = form.querySelector("#reviewRating");
    const nameInput = form.querySelector("#reviewerName");
    const imageInput = form.querySelector("#reviewImage");
    const submit = form.querySelector(".btnPrimary");
    const fields = [titleInput, descriptionInput, ratingInput, nameInput];
    const isEdit = form.dataset.mode === "edit";
    const id = isEdit ? getId() : null;
    const draftKey = isEdit ? "reviewEditDraft-" + id : "reviewCreateDraft";
    const limits = { reviewTitle: [5, 100, "Title"], reviewDescription: [20, 1000, "Description"], reviewerName: [2, 50, "Name"] };

    function errorFor(input) {
      let error = form.querySelector(".fieldError[data-for='" + input.id + "']");
      if (!error) {
        error = text("span", "fieldError", "");
        error.dataset.for = input.id;
        input.insertAdjacentElement("afterend", error);
      }
      return error;
    }
    function validate(input) {
      let message = "";
      if (input.id === "reviewRating") message = ["1", "2", "3", "4", "5"].includes(input.value) ? "" : "Please select a rating from 1 to 5.";
      else {
        const rule = limits[input.id];
        const length = input.value.trim().length;
        if (length < rule[0]) message = rule[2] + " must be at least " + rule[0] + " characters.";
        if (length > rule[1]) message = rule[2] + " must be " + rule[1] + " characters or less.";
      }
      errorFor(input).textContent = message;
      input.classList.toggle("inputInvalid", Boolean(message));
      input.classList.toggle("inputValid", !message);
      return !message;
    }
    function validateAll() {
      const valid = fields.every(validate);
      submit.disabled = !valid;
      return valid;
    }
    function count(input, maximum) {
      let counter = form.querySelector(".charCount[data-for='" + input.id + "']");
      if (!counter) {
        counter = text("span", "charCount", "");
        counter.dataset.for = input.id;
        input.insertAdjacentElement("afterend", counter);
      }
      counter.textContent = input.value.length + " / " + maximum + " characters";
    }
    function saveDraft() {
      localStorage.setItem(draftKey, JSON.stringify({ title: titleInput.value, description: descriptionInput.value, rating: ratingInput.value, reviewerName: nameInput.value }));
    }
    function restoreDraft() {
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey));
        if (!draft) return;
        titleInput.value = draft.title || "";
        descriptionInput.value = draft.description || "";
        ratingInput.value = draft.rating || "";
        nameInput.value = draft.reviewerName || "";
      } catch (error) { localStorage.removeItem(draftKey); }
    }
    function refreshForm() { count(titleInput, 100); count(descriptionInput, 1000); validateAll(); }
    function populate(review) {
      titleInput.value = review.title;
      descriptionInput.value = review.description;
      ratingInput.value = review.rating;
      nameInput.value = review.reviewerName;
      const detail = "/review/review-detail.html?id=" + review.id;
      document.querySelector(".backLink").href = detail;
      form.querySelector(".btnSecondary").href = detail;
    }
    fields.forEach(function (input) {
      input.addEventListener("input", function () { validate(input); refreshForm(); saveDraft(); });
      input.addEventListener("change", function () { validate(input); refreshForm(); saveDraft(); });
      input.addEventListener("blur", function () { validate(input); });
    });
    if (imageInput) imageInput.addEventListener("change", function () {
      const file = imageInput.files[0];
      if (!file) return;
      const allowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
      const smallEnough = file.size <= 5 * 1024 * 1024;
      const error = errorFor(imageInput);
      error.textContent = allowed && smallEnough ? "" : "Image must be a JPG, PNG or WEBP file under 5 MB.";
      if (!allowed || !smallEnough) imageInput.value = "";
    });
    if (isEdit) {
      if (!id) form.replaceWith(text("p", "fieldError", "No review was selected for editing."));
      else request(api + "/" + id).then(function (review) {
        if (String(review.userId) !== currentUser.id) throw new Error("You can only edit your own reviews.");
        populate(review);
        restoreDraft(); // Edit drafts are restored after the server review is loaded.
        refreshForm();
      }).catch(function (error) { form.replaceWith(text("p", "fieldError", error.message)); });
    } else { restoreDraft(); refreshForm(); }
    form.addEventListener("reset", function () { setTimeout(function () { localStorage.removeItem(draftKey); refreshForm(); }, 0); });
    const cancel = form.querySelector(".btnSecondary");
    if (cancel) cancel.addEventListener("click", function () { localStorage.removeItem(draftKey); });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validateAll()) return;
      request(isEdit ? api + "/" + id : api, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleInput.value, description: descriptionInput.value, rating: ratingInput.value, reviewerName: nameInput.value })
      }).then(function (review) {
        localStorage.removeItem(draftKey);
        location.href = "/review/review-detail.html?id=" + review.id;
      }).catch(function (error) {
        if (error.fields) Object.keys(error.fields).forEach(function (name) {
          const field = form.querySelector("[name='" + name + "']");
          if (field) errorFor(field).textContent = error.fields[name];
        });
        else alert(error.message);
      });
    });
  }

  const browseList = document.querySelector("#reviewListContainer");
  if (browseList) {
    const search = document.querySelector("#browseSearch");
    const rating = document.querySelector("#browseRating");
    const sort = document.querySelector("#browseSort");
    const count = document.querySelector("#listCount");
    let reviews = [];
    function render() {
      const query = search.value.trim().toLowerCase();
      const minimum = Number(rating.value) || 0;
      const visible = reviews.filter(function (review) {
        return review.rating >= minimum && [review.title, review.description, review.reviewerName].some(function (value) { return value.toLowerCase().includes(query); });
      });
      visible.sort(function (a, b) { return sort.value === "oldest" ? new Date(a.createdAt) - new Date(b.createdAt) : sort.value === "newest" ? new Date(b.createdAt) - new Date(a.createdAt) : 0; });
      browseList.replaceChildren();
      visible.forEach(function (review) { const item = document.createElement("li"); item.appendChild(reviewCard(review)); browseList.appendChild(item); });
      count.textContent = "Showing " + visible.length + " of " + reviews.length + " reviews";
    }
    document.querySelector(".filterBar").addEventListener("submit", function (event) { event.preventDefault(); });
    search.addEventListener("input", render); rating.addEventListener("change", render); sort.addEventListener("change", render);
    browseList.addEventListener("click", function (event) {
      const remove = event.target.closest(".actionDelete");
      if (!remove) return;
      event.preventDefault();
      if (!confirm("Delete this review? This cannot be undone.")) return;
      request(api + "/" + remove.dataset.reviewId, { method: "DELETE" }).then(function () { reviews = reviews.filter(function (review) { return String(review.id) !== remove.dataset.reviewId; }); render(); }).catch(function (error) { alert(error.message); });
    });
    request(api).then(function (data) { reviews = data; render(); }).catch(function (error) { listMessage(browseList, error.message); });
  }

  const mine = document.querySelector("#myReviewListContainer");
  if (mine) request(api).then(function (reviews) {
    const own = reviews.filter(function (review) { return String(review.userId) === currentUser.id; });
    if (!own.length) return listMessage(mine, "You have not written any reviews yet.");
    mine.replaceChildren(); own.forEach(function (review) { const item = document.createElement("li"); item.appendChild(reviewCard(review)); mine.appendChild(item); });
  }).catch(function (error) { listMessage(mine, error.message); });
  if (mine) mine.addEventListener("click", function (event) {
    const remove = event.target.closest(".actionDelete");
    if (!remove) return;
    event.preventDefault();
    if (!confirm("Delete this review? This cannot be undone.")) return;
    request(api + "/" + remove.dataset.reviewId, { method: "DELETE" })
      .then(function () { remove.closest("li").remove(); })
      .catch(function (error) { alert(error.message); });
  });

  const detail = document.querySelector("#reviewDetailContainer");
  if (detail) {
    const id = getId();
    if (!id) detail.replaceChildren(text("p", "fieldError", "No review was specified."));
    else request(api + "/" + id).then(function (review) {
      detail.querySelector(".reviewDetailTitle").textContent = review.title;
      const meta = detail.querySelector(".reviewDetailMeta"); meta.replaceChildren(text("span", "stars", "★".repeat(review.rating)), text("span", "", review.reviewerName), text("span", "", "Added " + review.createdAt));
      detail.querySelector(".reviewDetailImage").src = review.imageUrl;
      detail.querySelector(".reviewDetailDescription").textContent = review.description;
      const actions = detail.querySelector(".reviewDetailHeaderActions");
      if (String(review.userId) !== currentUser.id) return actions.style.display = "none";
      actions.querySelector("a").href = "/review/review-edit.html?id=" + review.id;
      actions.querySelector("form").addEventListener("submit", function (event) { event.preventDefault(); if (confirm("Delete this review? This cannot be undone.")) request(api + "/" + review.id, { method: "DELETE" }).then(function () { location.href = "/review/review-browse.html"; }).catch(function (error) { alert(error.message); }); });
    }).catch(function (error) { detail.replaceChildren(text("p", "fieldError", error.message)); });
  }
});

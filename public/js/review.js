document.addEventListener("DOMContentLoaded", async function () {
  const reviewApi = "/api/reviews";
  const placeholderImage = "/images/review-placeholder.jpg";
  const maximumImageBytes = 4 * 1024 * 1024;
  const allowedImageTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  // All Review pages use the same authenticated user supplied by the shared server.
  let currentUser;
  try {
    currentUser = await requestJson("/api/current-user");
  } catch (error) {
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign("/login.html?returnTo=" + returnTo);
    return;
  }

  function requestJson(url, options) {
    return fetch(url, options).then(async function (response) {
      if (response.status === 204) {
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : { error: await response.text() };

      if (!response.ok) {
        const error = new Error(
          data.error || "The request could not be completed.",
        );
        error.fields = data.errors || null;
        throw error;
      }

      return data;
    });
  }

  // Text is always assigned with textContent so review content cannot become markup.
  function createTextElement(tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = value;
    return element;
  }

  function reviewIdFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "reviews" && parts[1] ? parts[1] : null;
  }

  function formatDate(dateValue) {
    const date = new Date(dateValue + "T00:00:00");
    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function makeStars(rating) {
    const stars = createTextElement(
      "span",
      "stars",
      "★".repeat(rating) + "☆".repeat(5 - rating),
    );
    stars.setAttribute("aria-label", rating + " out of 5 stars");
    return stars;
  }

  function setStatus(element, message, isError) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.toggle("statusError", Boolean(isError));
    element.classList.toggle("statusSuccess", Boolean(message) && !isError);
  }

  function makeAction(label, className, href) {
    const link = createTextElement("a", className, label);
    link.href = href;
    return link;
  }

  // Builds one list card using DOM methods rather than interpolated HTML.
  function makeReviewCard(review) {
    const article = document.createElement("article");
    article.className = "reviewListItem";

    const imageCell = document.createElement("div");
    imageCell.className = "reviewThumbnailCell";
    const image = document.createElement("img");
    image.className = "reviewThumbnail";
    image.src = review.imageUrl || placeholderImage;
    image.alt = "Image for " + review.courseCode + ": " + review.title;
    imageCell.appendChild(image);

    const content = document.createElement("div");
    content.className = "reviewListContentCell";
    const courseCode = createTextElement("p", "courseCode", review.courseCode);
    const heading = document.createElement("h3");
    heading.className = "reviewListTitle";
    heading.appendChild(
      makeAction(review.title, "reviewTitleLink", "/reviews/" + review.id),
    );
    const summary = createTextElement(
      "p",
      "reviewListSummary",
      review.description.length > 160
        ? review.description.slice(0, 157) + "..."
        : review.description,
    );
    const meta = document.createElement("p");
    meta.className = "reviewListMeta";
    meta.append(
      makeStars(review.rating),
      createTextElement("span", "reviewerMeta", review.reviewerName),
      createTextElement(
        "span",
        "dateMeta",
        "Added " + formatDate(review.createdAt),
      ),
    );
    content.append(courseCode, heading, summary, meta);

    const actions = document.createElement("div");
    actions.className = "reviewListActionsCell";
    actions.appendChild(
      makeAction("View", "actionView", "/reviews/" + review.id),
    );

    if (String(review.userId) === String(currentUser.id)) {
      actions.appendChild(
        makeAction("Edit", "actionEdit", "/reviews/" + review.id + "/edit"),
      );
      const removeButton = createTextElement("button", "actionDelete", "Delete");
      removeButton.type = "button";
      removeButton.dataset.reviewId = review.id;
      removeButton.setAttribute("aria-label", "Delete review: " + review.title);
      actions.appendChild(removeButton);
    }

    article.append(imageCell, content, actions);
    return article;
  }

  function showListMessage(list, message) {
    const item = createTextElement("li", "emptyMessage", message);
    list.replaceChildren(item);
  }

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.addEventListener("load", function () {
        resolve(String(reader.result));
      });
      reader.addEventListener("error", function () {
        reject(new Error("The selected image could not be read."));
      });
      reader.readAsDataURL(file);
    });
  }

  const form = document.querySelector(".reviewForm");
  if (form) {
    initialiseReviewForm(form);
  }

  function initialiseReviewForm(reviewForm) {
    const titleInput = reviewForm.querySelector("#reviewTitle");
    const courseInput = reviewForm.querySelector("#reviewCourseCode");
    const descriptionInput = reviewForm.querySelector("#reviewDescription");
    const ratingInput = reviewForm.querySelector("#reviewRating");
    const imageInput = reviewForm.querySelector("#reviewImage");
    const imagePreview = reviewForm.querySelector("#reviewImagePreview");
    const previewContainer = reviewForm.querySelector("#reviewImagePreviewContainer");
    const reviewerIdentity = reviewForm.querySelector("#reviewerIdentity");
    const formStatus = reviewForm.querySelector(".formStatus");
    const submitButton = reviewForm.querySelector(".btnPrimary");
    const fields = [courseInput, titleInput, descriptionInput, ratingInput];
    const isEdit = reviewForm.dataset.mode === "edit";
    const reviewId = isEdit ? reviewIdFromPath() : null;
    const draftKey = isEdit
      ? "reviewEditDraft-" + reviewId
      : "reviewCreateDraft";
    let replacementImageUrl = null;
    let pendingImageRead = Promise.resolve();

    reviewerIdentity.textContent = currentUser.name + " (" + currentUser.sid + ")";

    function fieldError(input) {
      return reviewForm.querySelector("#" + input.id + "Error");
    }

    function validateField(input, showState) {
      const value = input.value.trim();
      let message = "";

      if (input === courseInput && !/^[A-Za-z]{4}\d{4}$/.test(value)) {
        message = "Enter a course code using four letters and four numbers.";
      } else if (input === titleInput && value.length < 5) {
        message = "Title must be at least 5 characters.";
      } else if (input === titleInput && value.length > 100) {
        message = "Title must be 100 characters or less.";
      } else if (input === descriptionInput && value.length < 20) {
        message = "Description must be at least 20 characters.";
      } else if (input === descriptionInput && value.length > 1000) {
        message = "Description must be 1000 characters or less.";
      } else if (
        input === ratingInput &&
        !["1", "2", "3", "4", "5"].includes(value)
      ) {
        message = "Select a whole-number rating from 1 to 5.";
      }

      if (showState) {
        fieldError(input).textContent = message;
        input.classList.toggle("inputInvalid", Boolean(message));
        input.classList.toggle("inputValid", !message);
        input.setAttribute("aria-invalid", String(Boolean(message)));
      }
      return !message;
    }

    // A loop is intentional: every invalid field is reported on one submission.
    function validateAll(showState) {
      let formIsValid = true;
      fields.forEach(function (input) {
        if (!validateField(input, showState)) {
          formIsValid = false;
        }
      });
      return formIsValid;
    }

    function updateCounter(input, maximum) {
      const counter = reviewForm.querySelector("#" + input.id + "Count");
      counter.textContent = input.value.length + " / " + maximum;
    }

    function refreshCounters() {
      updateCounter(titleInput, 100);
      updateCounter(descriptionInput, 1000);
    }

    function saveDraft() {
      const draft = {
        courseCode: courseInput.value,
        title: titleInput.value,
        description: descriptionInput.value,
        rating: ratingInput.value,
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }

    function restoreDraft() {
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey));
        if (!draft) {
          return;
        }
        courseInput.value = draft.courseCode || "";
        titleInput.value = draft.title || "";
        descriptionInput.value = draft.description || "";
        ratingInput.value = draft.rating || "";
      } catch (error) {
        localStorage.removeItem(draftKey);
      }
    }

    function displayPreview(imageUrl) {
      imagePreview.src = imageUrl;
      previewContainer.hidden = false;
    }

    async function handleImageSelection() {
      const file = imageInput.files[0];
      const errorElement = fieldError(imageInput);
      replacementImageUrl = null;

      if (!file) {
        errorElement.textContent = "";
        imageInput.classList.remove("inputInvalid", "inputValid");
        imageInput.setAttribute("aria-invalid", "false");
        if (!isEdit) {
          previewContainer.hidden = true;
          imagePreview.removeAttribute("src");
        }
        return;
      }

      let message = "";
      if (!allowedImageTypes.includes(file.type)) {
        message = "Choose a JPEG, PNG, GIF, or WebP image.";
      } else if (file.size > maximumImageBytes) {
        message = "Image size must not exceed 4 MB.";
      }

      if (message) {
        errorElement.textContent = message;
        imageInput.classList.add("inputInvalid");
        imageInput.classList.remove("inputValid");
        imageInput.setAttribute("aria-invalid", "true");
        imageInput.value = "";
        return;
      }

      try {
        replacementImageUrl = await readImageFile(file);
        displayPreview(replacementImageUrl);
        errorElement.textContent = "";
        imageInput.classList.add("inputValid");
        imageInput.classList.remove("inputInvalid");
        imageInput.setAttribute("aria-invalid", "false");
      } catch (error) {
        errorElement.textContent = error.message;
        imageInput.classList.add("inputInvalid");
        imageInput.classList.remove("inputValid");
        imageInput.setAttribute("aria-invalid", "true");
      }
    }

    function populateForm(review) {
      courseInput.value = review.courseCode;
      titleInput.value = review.title;
      descriptionInput.value = review.description;
      ratingInput.value = String(review.rating);
      displayPreview(review.imageUrl || placeholderImage);
      imagePreview.alt = "Current image for " + review.title;
      const detailUrl = "/reviews/" + review.id;
      reviewForm.querySelector(".btnSecondary").href = detailUrl;
      document.querySelector(".backLink").href = detailUrl;
    }

    fields.forEach(function (input) {
      input.addEventListener("input", function () {
        if (input === courseInput) {
          input.value = input.value.toUpperCase();
        }
        validateField(input, true);
        refreshCounters();
        saveDraft();
      });
      input.addEventListener("change", function () {
        validateField(input, true);
        saveDraft();
      });
      input.addEventListener("blur", function () {
        validateField(input, true);
      });
    });
    imageInput.addEventListener("change", function () {
      pendingImageRead = handleImageSelection();
    });

    if (isEdit) {
      if (!reviewId || !/^\d+$/.test(reviewId)) {
        reviewForm.replaceWith(
          createTextElement(
            "p",
            "pageMessage statusError",
            "No valid review was selected.",
          ),
        );
        return;
      }

      requestJson(reviewApi + "/" + reviewId)
        .then(function (review) {
          if (String(review.userId) !== String(currentUser.id)) {
            throw new Error("You can only edit your own reviews.");
          }
          populateForm(review);
          restoreDraft();
          refreshCounters();
        })
        .catch(function (error) {
          reviewForm.replaceWith(
            createTextElement("p", "pageMessage statusError", error.message),
          );
        });
    } else {
      restoreDraft();
      refreshCounters();
    }

    reviewForm.addEventListener("reset", function () {
      window.setTimeout(function () {
        localStorage.removeItem(draftKey);
        replacementImageUrl = null;
        fields.forEach(function (input) {
          fieldError(input).textContent = "";
          input.classList.remove("inputInvalid", "inputValid");
          input.setAttribute("aria-invalid", "false");
        });
        fieldError(imageInput).textContent = "";
        previewContainer.hidden = true;
        imagePreview.removeAttribute("src");
        refreshCounters();
        setStatus(formStatus, "Form cleared.", false);
      }, 0);
    });

    const cancelLink = reviewForm.querySelector(".btnSecondary");
    if (cancelLink && cancelLink.tagName === "A") {
      cancelLink.addEventListener("click", function () {
        localStorage.removeItem(draftKey);
      });
    }

    reviewForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus(formStatus, "", false);

      if (!validateAll(true)) {
        setStatus(formStatus, "Please correct the highlighted fields.", true);
        const firstInvalid = reviewForm.querySelector(".inputInvalid");
        if (firstInvalid) {
          firstInvalid.focus();
        }
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = isEdit ? "Saving changes..." : "Saving review...";

      // Prevent a fast submission from racing a FileReader operation.
      await pendingImageRead;

      const payload = {
        courseCode: courseInput.value.trim().toUpperCase(),
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        rating: Number(ratingInput.value),
      };
      if (replacementImageUrl) {
        payload.imageUrl = replacementImageUrl;
      }

      try {
        const review = await requestJson(
          isEdit ? reviewApi + "/" + reviewId : reviewApi,
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        localStorage.removeItem(draftKey);
        window.location.assign("/reviews/" + review.id);
      } catch (error) {
        if (error.fields) {
          Object.keys(error.fields).forEach(function (name) {
            const input =
              name === "imageUrl"
                ? imageInput
                : reviewForm.querySelector("[name='" + name + "']");
            if (input) {
              fieldError(input).textContent = error.fields[name];
              input.classList.add("inputInvalid");
              input.classList.remove("inputValid");
              input.setAttribute("aria-invalid", "true");
            }
          });
        }
        setStatus(formStatus, error.message, true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = isEdit ? "Save Changes" : "Save Review";
      }
    });
  }

  const browseList = document.querySelector("#reviewListContainer");
  if (browseList) {
    initialiseBrowsePage(browseList);
  }

  function initialiseBrowsePage(reviewList) {
    const filterForm = document.querySelector(".filterBar");
    const searchInput = document.querySelector("#browseSearch");
    const ratingInput = document.querySelector("#browseRating");
    const sortInput = document.querySelector("#browseSort");
    const count = document.querySelector("#listCount");
    const pageStatus = document.querySelector("#browseStatus");
    let allReviews = [];

    function renderReviews() {
      const query = searchInput.value.trim().toLowerCase();
      const minimumRating = Number(ratingInput.value) || 0;
      const visibleReviews = allReviews.filter(function (review) {
        const searchableValues = [
          review.courseCode,
          review.title,
          review.description,
          review.reviewerName,
        ];
        return (
          review.rating >= minimumRating &&
          searchableValues.some(function (value) {
            return String(value).toLowerCase().includes(query);
          })
        );
      });

      visibleReviews.sort(function (first, second) {
        if (sortInput.value === "oldest") {
          return new Date(first.createdAt) - new Date(second.createdAt);
        }
        if (sortInput.value === "highest") {
          return second.rating - first.rating;
        }
        return new Date(second.createdAt) - new Date(first.createdAt);
      });

      reviewList.replaceChildren();
      if (!visibleReviews.length) {
        showListMessage(reviewList, "No reviews match those filters.");
      } else {
        visibleReviews.forEach(function (review) {
          const item = document.createElement("li");
          item.appendChild(makeReviewCard(review));
          reviewList.appendChild(item);
        });
      }
      count.textContent =
        "Showing " + visibleReviews.length + " of " + allReviews.length + " reviews";
    }

    filterForm.addEventListener("submit", function (event) {
      event.preventDefault();
      renderReviews();
    });
    searchInput.addEventListener("input", renderReviews);
    ratingInput.addEventListener("change", renderReviews);
    sortInput.addEventListener("change", renderReviews);

    reviewList.addEventListener("click", async function (event) {
      const removeButton = event.target.closest(".actionDelete");
      if (!removeButton) {
        return;
      }
      if (!window.confirm("Delete this review? This cannot be undone.")) {
        return;
      }

      try {
        await requestJson(reviewApi + "/" + removeButton.dataset.reviewId, {
          method: "DELETE",
        });
        allReviews = allReviews.filter(function (review) {
          return String(review.id) !== removeButton.dataset.reviewId;
        });
        renderReviews();
        setStatus(pageStatus, "Review deleted.", false);
      } catch (error) {
        setStatus(pageStatus, error.message, true);
      }
    });

    requestJson(reviewApi)
      .then(function (reviews) {
        allReviews = reviews;
        renderReviews();
      })
      .catch(function (error) {
        showListMessage(reviewList, error.message);
        setStatus(pageStatus, error.message, true);
      });
  }

  const myReviewList = document.querySelector("#myReviewListContainer");
  if (myReviewList) {
    initialiseMyReviews(myReviewList);
  }

  function initialiseMyReviews(reviewList) {
    const pageStatus = document.querySelector("#myReviewsStatus");

    requestJson(reviewApi)
      .then(function (reviews) {
        const ownReviews = reviews.filter(function (review) {
          return String(review.userId) === String(currentUser.id);
        });
        if (!ownReviews.length) {
          showListMessage(reviewList, "You have not written any reviews yet.");
          return;
        }
        reviewList.replaceChildren();
        ownReviews.forEach(function (review) {
          const item = document.createElement("li");
          item.appendChild(makeReviewCard(review));
          reviewList.appendChild(item);
        });
      })
      .catch(function (error) {
        showListMessage(reviewList, error.message);
      });

    reviewList.addEventListener("click", async function (event) {
      const removeButton = event.target.closest(".actionDelete");
      if (!removeButton) {
        return;
      }
      if (!window.confirm("Delete this review? This cannot be undone.")) {
        return;
      }
      try {
        await requestJson(reviewApi + "/" + removeButton.dataset.reviewId, {
          method: "DELETE",
        });
        removeButton.closest("li").remove();
        if (!reviewList.children.length) {
          showListMessage(reviewList, "You have not written any reviews yet.");
        }
        setStatus(pageStatus, "Review deleted.", false);
      } catch (error) {
        setStatus(pageStatus, error.message, true);
      }
    });
  }

  const detailContainer = document.querySelector("#reviewDetailContainer");
  if (detailContainer) {
    initialiseDetailPage(detailContainer);
  }

  function initialiseDetailPage(container) {
    const reviewId = reviewIdFromPath();
    if (!reviewId || !/^\d+$/.test(reviewId)) {
      container.replaceChildren(
        createTextElement(
          "p",
          "pageMessage statusError",
          "No valid review was specified.",
        ),
      );
      return;
    }

    requestJson(reviewApi + "/" + reviewId)
      .then(function (review) {
        document.title = review.courseCode + " review | RMIT Connect";
        container.querySelector(".reviewDetailCourse").textContent = review.courseCode;
        container.querySelector(".reviewDetailTitle").textContent = review.title;

        const meta = container.querySelector(".reviewDetailMeta");
        meta.replaceChildren(
          makeStars(review.rating),
          createTextElement("span", "reviewerMeta", review.reviewerName),
          createTextElement(
            "span",
            "dateMeta",
            "Added " + formatDate(review.createdAt),
          ),
        );

        const image = container.querySelector(".reviewDetailImage");
        image.src = review.imageUrl || placeholderImage;
        image.alt = "Image for " + review.courseCode + ": " + review.title;
        container.querySelector(".reviewDetailDescription").textContent =
          review.description;

        const actions = container.querySelector(".reviewDetailHeaderActions");
        if (String(review.userId) !== String(currentUser.id)) {
          actions.hidden = true;
          return;
        }

        actions.querySelector(".actionEditButton").href =
          "/reviews/" + review.id + "/edit";
        actions
          .querySelector(".actionDeleteButton")
          .addEventListener("click", async function () {
            if (!window.confirm("Delete this review? This cannot be undone.")) {
              return;
            }
            try {
              await requestJson(reviewApi + "/" + review.id, {
                method: "DELETE",
              });
              window.location.assign("/reviews/browse");
            } catch (error) {
              setStatus(
                container.querySelector(".detailStatus"),
                error.message,
                true,
              );
            }
          });
      })
      .catch(function (error) {
        container.replaceChildren(
          createTextElement("p", "pageMessage statusError", error.message),
        );
      });
  }
});

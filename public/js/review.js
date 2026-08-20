document.addEventListener("DOMContentLoaded", function () {
  function getCurrentUser() {
    if (
      typeof window.getCurrentUser === "function" &&
      window.getCurrentUser !== getCurrentUser
    ) {
      return window.getCurrentUser();
    }
    return {
      id: "1",
      username: "hung",
      email: "hung@student.rmit.edu.au",
    };
  }

  const reviewForm = document.querySelector(".reviewForm");

  if (reviewForm) {
    const titleInput = reviewForm.querySelector("#reviewTitle");
    const descriptionInput = reviewForm.querySelector("#reviewDescription");
    const ratingSelect = reviewForm.querySelector("#reviewRating");
    const reviewerInput = reviewForm.querySelector("#reviewerName");
    const imageInput = reviewForm.querySelector("#reviewImage");
    const submitBtn = reviewForm.querySelector(".btnPrimary");

    const rules = {
      reviewTitle: function (value) {
        if (value.trim().length === 0) return "Title is required.";
        if (value.trim().length < 5)
          return "Title must be at least 5 characters.";
        if (value.trim().length > 100)
          return "Title must be under 100 characters.";
        return "";
      },
      reviewDescription: function (value) {
        if (value.trim().length === 0) return "Description is required.";
        if (value.trim().length < 20)
          return "Description must be at least 20 characters.";
        return "";
      },
      reviewRating: function (value) {
        if (!value) return "Please select a star rating.";
        return "";
      },
      reviewerName: function (value) {
        if (value.trim().length === 0) return "Reviewer name is required.";
        if (value.trim().length < 2)
          return "Name must be at least 2 characters.";
        return "";
      },
    };

    function getErrorElement(input) {
      let errorEl = input.parentElement.querySelector(".fieldError");
      if (!errorEl) {
        errorEl = document.createElement("span");
        errorEl.className = "fieldError";
        input.insertAdjacentElement("afterend", errorEl);
      }
      return errorEl;
    }

    function validateField(input) {
      const rule = rules[input.id];
      if (!rule) return true;

      const message = rule(input.value);
      const errorEl = getErrorElement(input);

      if (message) {
        errorEl.textContent = message;
        input.classList.add("inputInvalid");
        input.classList.remove("inputValid");
        return false;
      } else {
        errorEl.textContent = "";
        input.classList.remove("inputInvalid");
        input.classList.add("inputValid");
        return true;
      }
    }

    function updateCharacterCount(input, max) {
      let counterEl = input.parentElement.querySelector(".charCount");
      if (!counterEl) {
        counterEl = document.createElement("span");
        counterEl.className = "charCount";
        input.insertAdjacentElement("afterend", counterEl);
      }
      counterEl.textContent = input.value.length + " / " + max + " characters";
    }

    function validateWholeForm() {
      const fieldsToCheck = [
        titleInput,
        descriptionInput,
        ratingSelect,
        reviewerInput,
      ];
      let allValid = true;
      fieldsToCheck.forEach(function (input) {
        if (input && !validateField(input)) {
          allValid = false;
        }
      });
      if (submitBtn) submitBtn.disabled = !allValid;
      return allValid;
    }

    [titleInput, descriptionInput, ratingSelect, reviewerInput].forEach(
      function (input) {
        if (!input) return;
        input.addEventListener("input", function () {
          validateField(input);
          validateWholeForm();
          saveDraftToStorage();
        });
        input.addEventListener("blur", function () {
          validateField(input);
        });
      },
    );

    if (titleInput)
      titleInput.addEventListener("input", function () {
        updateCharacterCount(titleInput, 100);
      });
    if (descriptionInput)
      descriptionInput.addEventListener("input", function () {
        updateCharacterCount(descriptionInput, 1000);
      });

    if (imageInput) {
      imageInput.addEventListener("change", function () {
        const errorEl = getErrorElement(imageInput);
        const file = imageInput.files[0];
        if (!file) {
          errorEl.textContent = "";
          return;
        }
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        const maxSizeBytes = 5 * 1024 * 1024;

        if (!allowedTypes.includes(file.type)) {
          errorEl.textContent = "Image must be a JPG, PNG, or WEBP file.";
          imageInput.value = "";
        } else if (file.size > maxSizeBytes) {
          errorEl.textContent = "Image must be under 5MB.";
          imageInput.value = "";
        } else {
          errorEl.textContent = "";
        }
      });
    }

    const isEditForm = reviewForm.getAttribute("action") === "/reviews/update";
    const reviewIdField = reviewForm.querySelector("input[name='id']");
    const storageKey = isEditForm
      ? "reviewEditDraft-" + (reviewIdField ? reviewIdField.value : "unknown")
      : "reviewCreateDraft";

    function saveDraftToStorage() {
      const draft = {
        title: titleInput ? titleInput.value : "",
        description: descriptionInput ? descriptionInput.value : "",
        rating: ratingSelect ? ratingSelect.value : "",
        reviewerName: reviewerInput ? reviewerInput.value : "",
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    }

    function restoreDraftFromStorage() {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      try {
        const draft = JSON.parse(saved);
        if (titleInput && draft.title) titleInput.value = draft.title;
        if (descriptionInput && draft.description)
          descriptionInput.value = draft.description;
        if (ratingSelect && draft.rating) ratingSelect.value = draft.rating;
        if (reviewerInput && draft.reviewerName)
          reviewerInput.value = draft.reviewerName;
      } catch (error) {
        console.error("Could not restore saved draft:", error);
      }
    }

    function clearDraftFromStorage() {
      localStorage.removeItem(storageKey);
    }

    if (!isEditForm) {
      restoreDraftFromStorage();
    }
    validateWholeForm();

    const cancelBtn = reviewForm.querySelector(".btnSecondary");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        clearDraftFromStorage();
      });
    }

    reviewForm.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!validateWholeForm()) {
        return;
      }

      const formData = new FormData(reviewForm);
      const url = isEditForm
        ? "/reviews/" + (reviewIdField ? reviewIdField.value : "")
        : "/reviews";
      const method = isEditForm ? "PUT" : "POST";

      fetch(url, {
        method: method,
        body: formData,
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error(
              "Server rejected the review, check the required fields.",
            );
          }
          return response.json();
        })
        .then(function (savedReview) {
          clearDraftFromStorage();
          window.location.href =
            "/review/review-detail.html?id=" + savedReview.id;
        })
        .catch(function (error) {
          alert(error.message);
        });
    });
  }

  function buildReviewListItemHtml(review, currentUser) {
    const isOwner =
      currentUser && String(review.userId) === String(currentUser.id);

    return (
      '<article class="reviewListItem">' +
      '<div class="reviewThumbnailCell">' +
      '<img class="reviewThumbnail" src="' +
      review.imageUrl +
      '" alt="Thumbnail image for the review titled ' +
      review.title +
      '">' +
      "</div>" +
      '<div class="reviewListContentCell">' +
      '<h3 class="reviewListTitle"><a href="/review/review-detail.html?id=' +
      review.id +
      '">' +
      review.title +
      "</a></h3>" +
      '<p class="reviewListSummary">' +
      review.description.slice(0, 140) +
      "</p>" +
      '<p class="reviewListMeta">' +
      '<span class="stars" aria-label="' +
      review.rating +
      ' out of 5 stars">' +
      "★".repeat(review.rating) +
      "</span>" +
      "<span>" +
      review.reviewerName +
      "</span>" +
      "<span>Added " +
      review.createdAt +
      "</span>" +
      "</p>" +
      "</div>" +
      '<div class="reviewListActionsCell">' +
      '<a href="/review/review-detail.html?id=' +
      review.id +
      '" class="actionView">View</a>' +
      (isOwner
        ? '<a href="/review/review-edit.html?id=' +
          review.id +
          '" class="actionEdit">Edit</a>'
        : "") +
      (isOwner
        ? '<a href="#" class="actionDelete" data-review-id="' +
          review.id +
          '">Delete</a>'
        : "") +
      "</div>" +
      "</article>"
    );
  }

  const reviewListContainer = document.querySelector("#reviewListContainer");

  if (reviewListContainer) {
    const searchInput = document.querySelector("#browseSearch");
    const ratingFilter = document.querySelector("#browseRating");
    const sortOrder = document.querySelector("#browseSort");
    const listCountEl = document.querySelector("#listCount");
    const filterForm = document.querySelector(".filterBar");

    let allReviews = [];

    if (filterForm) {
      filterForm.addEventListener("submit", function (event) {
        event.preventDefault();
      });
    }

    function fetchReviews() {
      fetch("/reviews")
        .then(function (response) {
          if (!response.ok) throw new Error("Could not load reviews.");
          return response.json();
        })
        .then(function (reviews) {
          allReviews = reviews;
          renderReviews();
        })
        .catch(function (error) {
          reviewListContainer.innerHTML = "<li>" + error.message + "</li>";
        });
    }

    function renderReviews() {
      const currentUser = getCurrentUser();
      const searchTerm = searchInput
        ? searchInput.value.trim().toLowerCase()
        : "";
      const minRating = ratingFilter ? Number(ratingFilter.value) || 0 : 0;
      const sortValue = sortOrder ? sortOrder.value : "";

      let filtered = allReviews.filter(function (review) {
        const matchesSearch =
          searchTerm === "" ||
          review.title.toLowerCase().includes(searchTerm) ||
          review.description.toLowerCase().includes(searchTerm) ||
          review.reviewerName.toLowerCase().includes(searchTerm);

        const matchesRating = review.rating >= minRating;

        return matchesSearch && matchesRating;
      });

      if (sortValue === "newest") {
        filtered.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      } else if (sortValue === "oldest") {
        filtered.sort(function (a, b) {
          return new Date(a.createdAt) - new Date(b.createdAt);
        });
      }

      reviewListContainer.innerHTML = "";

      filtered.forEach(function (review) {
        const li = document.createElement("li");
        li.innerHTML = buildReviewListItemHtml(review, currentUser);
        reviewListContainer.appendChild(li);
      });

      if (listCountEl) {
        listCountEl.textContent =
          "Showing " +
          filtered.length +
          " of " +
          allReviews.length +
          " reviews";
      }
    }

    if (searchInput) searchInput.addEventListener("input", renderReviews);
    if (ratingFilter) ratingFilter.addEventListener("change", renderReviews);
    if (sortOrder) sortOrder.addEventListener("change", renderReviews);

    reviewListContainer.addEventListener("click", function (event) {
      const deleteLink = event.target.closest(".actionDelete");
      if (!deleteLink) return;

      event.preventDefault();
      const reviewId = deleteLink.getAttribute("data-review-id");
      const confirmed = confirm("Delete this review? This cannot be undone.");
      if (!confirmed) return;

      fetch("/reviews/" + reviewId, { method: "DELETE" })
        .then(function (response) {
          if (!response.ok) throw new Error("Could not delete this review.");
          allReviews = allReviews.filter(function (review) {
            return String(review.id) !== String(reviewId);
          });
          renderReviews();
        })
        .catch(function (error) {
          alert(error.message);
        });
    });

    fetchReviews();
  }
  const myReviewListContainer = document.querySelector(
    "#myReviewListContainer",
  );

  if (myReviewListContainer) {
    const currentUser = getCurrentUser();

    fetch("/reviews")
      .then(function (response) {
        if (!response.ok) throw new Error("Could not load your reviews.");
        return response.json();
      })
      .then(function (reviews) {
        const myReviews = reviews.filter(function (review) {
          return (
            currentUser && String(review.userId) === String(currentUser.id)
          );
        });

        myReviewListContainer.innerHTML = "";

        if (myReviews.length === 0) {
          myReviewListContainer.innerHTML =
            "<li>You have not written any reviews yet.</li>";
          return;
        }

        myReviews.forEach(function (review) {
          const li = document.createElement("li");
          li.innerHTML = buildReviewListItemHtml(review, currentUser);
          myReviewListContainer.appendChild(li);
        });
      })
      .catch(function (error) {
        myReviewListContainer.innerHTML = "<li>" + error.message + "</li>";
      });

    myReviewListContainer.addEventListener("click", function (event) {
      const deleteLink = event.target.closest(".actionDelete");
      if (!deleteLink) return;

      event.preventDefault();
      const reviewId = deleteLink.getAttribute("data-review-id");
      const confirmed = confirm("Delete this review? This cannot be undone.");
      if (!confirmed) return;

      fetch("/reviews/" + reviewId, { method: "DELETE" })
        .then(function (response) {
          if (!response.ok) throw new Error("Could not delete this review.");
          deleteLink.closest("li").remove();
        })
        .catch(function (error) {
          alert(error.message);
        });
    });
  }

  const detailContainer = document.querySelector("#reviewDetailContainer");

  if (detailContainer) {
    const params = new URLSearchParams(window.location.search);
    const reviewId = params.get("id");

    if (!reviewId) {
      detailContainer.innerHTML = "<p>No review was specified.</p>";
    } else {
      const editLink = detailContainer.querySelector(
        ".reviewDetailHeaderActions a.btnPrimary",
      );
      const deleteForm = detailContainer.querySelector(
        ".reviewDetailHeaderActions form",
      );
      const deleteHiddenInput = deleteForm
        ? deleteForm.querySelector("input[name='id']")
        : null;

      if (editLink) editLink.href = "/review/review-edit.html?id=" + reviewId;
      if (deleteHiddenInput) deleteHiddenInput.value = reviewId;

      if (deleteForm) {
        deleteForm.addEventListener("submit", function (event) {
          event.preventDefault();
          const confirmed = confirm(
            "Delete this review? This cannot be undone.",
          );
          if (!confirmed) return;

          fetch("/reviews/" + reviewId, { method: "DELETE" })
            .then(function (response) {
              if (!response.ok)
                throw new Error("Could not delete this review.");
              window.location.href = "/review/review-browse.html";
            })
            .catch(function (error) {
              alert(error.message);
            });
        });
      }

      fetch("/reviews/" + reviewId)
        .then(function (response) {
          if (!response.ok) throw new Error("This review could not be found.");
          return response.json();
        })
        .then(function (review) {
          const currentUser = getCurrentUser();
          const isOwner =
            currentUser && String(review.userId) === String(currentUser.id);

          const titleEl = detailContainer.querySelector(".reviewDetailTitle");
          const metaEl = detailContainer.querySelector(".reviewDetailMeta");
          const imageEl = detailContainer.querySelector(".reviewDetailImage");
          const descriptionEl = detailContainer.querySelector(
            ".reviewDetailDescription",
          );
          const actionsEl = detailContainer.querySelector(
            ".reviewDetailHeaderActions",
          );

          if (titleEl) titleEl.textContent = review.title;
          if (metaEl) {
            metaEl.innerHTML =
              '<span class="stars" aria-label="' +
              review.rating +
              ' out of 5 stars">' +
              "★".repeat(review.rating) +
              "</span>" +
              "<span>" +
              review.reviewerName +
              "</span>" +
              "<span>Added " +
              review.createdAt +
              "</span>";
          }
          if (imageEl) {
            imageEl.src = review.imageUrl;
            imageEl.alt = "Photo attached to the review titled " + review.title;
          }
          if (descriptionEl) descriptionEl.textContent = review.description;

          if (actionsEl && !isOwner) {
            actionsEl.style.display = "none";
          }
        })
        .catch(function (error) {
          detailContainer.innerHTML = "<p>" + error.message + "</p>";
        });
    }
  }
});

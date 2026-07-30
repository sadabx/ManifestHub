// =============================================================
// faq.js — FAQ Accordion Loader
// =============================================================
// Reads FAQ data from window.FAQ_DATA (data/faq.js) and renders 
// an interactive accordion in the #faqContainer element.
// =============================================================

/**
 * Loads FAQ entries from a JS data array and renders them as an
 * accordion widget with open/close toggle behavior.
 */
window.MH_initFAQ = function () {
  const faqs = window.FAQ_DATA;
  if (!faqs) {
    console.warn("FAQ data not loaded from data/faq.js");
    return;
  }

  const container = document.getElementById("faqContainer");
  if (!container) return;

  faqs.forEach((faq) => {
    const item = document.createElement("div");
    item.className = "faq-item";
    item.innerHTML = `
      <div class="faq-question">
        <span>${window.escapeHtml(faq.question)}</span>
        <i class="fas fa-chevron-down text-github-muted transition-transform"></i>
      </div>
      <div class="faq-answer">${faq.answer}</div>
    `;
    const questionDiv = item.querySelector(".faq-question");
    const answerDiv = item.querySelector(".faq-answer");
    const icon = item.querySelector("i");

    questionDiv.addEventListener("click", () => {
      const isOpen = answerDiv.classList.contains("open");
      // Close all other open ones (accordion behavior)
      document.querySelectorAll(".faq-answer.open").forEach((el) => {
        if (el !== answerDiv) {
          el.classList.remove("open");
          el.previousElementSibling.querySelector("i").style.transform =
            "rotate(0deg)";
        }
      });

      if (isOpen) {
        answerDiv.classList.remove("open");
        icon.style.transform = "rotate(0deg)";
      } else {
        answerDiv.classList.add("open");
        icon.style.transform = "rotate(180deg)";
      }
    });
    container.appendChild(item);
  });
};

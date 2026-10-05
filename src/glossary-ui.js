import { message } from "./i18n.js";

export function mountGlossary(container, addButton, status) {
  function updateCount() { addButton.disabled = container.children.length >= 200; }
  function row(entry = { source: "", replacement: "" }) {
    const wrapper = document.createElement("div"); wrapper.className = "glossary-row";
    for (const [key, label] of [["source", "sourceTerm"], ["replacement", "preferredTranslation"]]) {
      const input = document.createElement("input"); input.type = "text"; input.value = entry[key]; input.dataset.field = key;
      input.placeholder = message(label); input.setAttribute("aria-label", message(label));
      wrapper.append(input);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = message("removeTerm");
    remove.addEventListener("click", () => { const next = wrapper.nextElementSibling || wrapper.previousElementSibling; wrapper.remove(); updateCount(); (next?.querySelector("input") || addButton).focus(); });
    wrapper.append(remove); container.append(wrapper); updateCount(); return wrapper;
  }
  addButton.addEventListener("click", () => { if (container.children.length < 200) row().querySelector("input").focus(); });
  return {
    render(entries) { container.replaceChildren(); entries.forEach(row); updateCount(); status.textContent = ""; },
    entries() {
      const entries = [], seen = new Set();
      for (const wrapper of container.children) {
        const source = wrapper.querySelector('[data-field="source"]').value.trim();
        const replacement = wrapper.querySelector('[data-field="replacement"]').value.trim();
        if (!source && !replacement) continue;
        if (!source || !replacement || seen.has(source.toLocaleLowerCase())) {
          status.textContent = message("glossaryInvalid"); wrapper.querySelector("input").focus(); throw new Error(status.textContent);
        }
        seen.add(source.toLocaleLowerCase()); entries.push({ source, replacement });
      }
      status.textContent = ""; return entries;
    }
  };
}

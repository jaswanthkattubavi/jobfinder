// Serialized by chrome.scripting: keep this function self-contained.
export function inspectForm({ mode, answers, expectedUrl, expiresAt }) {
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== "string" ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now())
  )
    throw new Error("Application packet expired. Download a fresh packet.");
  const here = new URL(location.href),
    expected = new URL(expectedUrl);
  if (
    expected.protocol !== "https:" ||
    here.origin !== expected.origin ||
    here.pathname !== expected.pathname ||
    [...expected.searchParams.keys()].some(
      (key) =>
        JSON.stringify(here.searchParams.getAll(key)) !==
        JSON.stringify(expected.searchParams.getAll(key)),
    ) ||
    (expected.hash && here.hash !== expected.hash)
  )
    throw new Error("The page changed. Open the exact application URL and try again.");
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[\s*?:.]+$/g, "")
      .trim();
  const sensitive =
    /password|passcode|\botp\b|one.time|verification.code|captcha|credit.card|payment|cc.number|cc.name|cc.exp|cc.csc|transaction.|bank.account|sort.code|routing.number|iban|security.answer|signature|sign.here|consent|agree|certif|declar|acknowledg|privacy|terms|demographic|\beeo\b|pronoun|ethnic|race|racial|religio|disabilit|health|medical|gender|sexual|veteran|criminal|conviction|date.of.birth|national.insurance|passport|social.security/i;
  const map = new Map(answers.map((a) => [normalize(a.question), a.answer]));
  const secret =
    /password|passcode|\botp\b|one.time|verification.code|captcha|credit.card|payment|cc.number|cc.name|cc.exp|cc.csc|transaction.|bank.account|sort.code|routing.number|iban|security.answer|national.insurance|passport|social.security/i;
  const questions = [],
    results = [],
    groups = new Set();
  const controls = [...document.querySelectorAll("input,select,textarea")];
  const visible = (el) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden" &&
    !el.disabled &&
    !el.readOnly;
  const text = (el) => el?.textContent?.replace(/\s+/g, " ").trim() || "";
  const labelFor = (el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    return (
      ids
        .map((id) => text(document.getElementById(id)))
        .join(" ")
        .trim() ||
      el.getAttribute("aria-label")?.trim() ||
      [...(el.labels || [])].map(text).join(" ").trim() ||
      ""
    );
  };
  const change = (el, value) => {
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : el.tagName === "SELECT"
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  for (const el of controls) {
    if (!visible(el)) continue;
    const type =
      el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : el.type;
    if (["submit", "reset", "button", "hidden", "image"].includes(type)) continue;
    let label = labelFor(el),
      members = [el],
      options = [];
    if (type === "radio") {
      const groupKey = `${[...document.forms].indexOf(el.form)}:${el.name}`;
      if (!el.name || groups.has(groupKey)) continue;
      groups.add(groupKey);
      members = controls.filter(
        (other) =>
          other.type === "radio" &&
          other.name === el.name &&
          other.form === el.form &&
          visible(other),
      );
      label = text(el.closest("fieldset")?.querySelector("legend"));
      options = members.map(labelFor);
    } else if (type === "select")
      options = [...el.options]
        .filter((o) => !o.disabled && !o.parentElement?.disabled)
        .map((o) => o.text.trim());
    const key = normalize(label);
    const blocked =
      !label ||
      sensitive.test(
        `${label} ${el.name} ${el.id} ${el.autocomplete} ${el.closest("fieldset")?.textContent || ""}`,
      ) ||
      !["text", "email", "tel", "url", "number", "textarea", "select", "radio"].includes(type) ||
      el.multiple;
    if (blocked) {
      results.push({
        label: label || "Unlabelled control",
        status: type === "file" ? "Upload file manually" : "Manual answer required",
      });
      // Export only labels/options, never page values. Secret and file controls stay on the site.
      if (
        label &&
        type !== "file" &&
        type !== "password" &&
        !secret.test(
          `${label} ${el.name} ${el.id} ${el.autocomplete} ${el.closest("fieldset")?.textContent || ""}`,
        )
      )
        questions.push({
          key,
          label,
          required: members.some((m) => m.required || m.getAttribute("aria-required") === "true"),
          options,
          type,
          manual: true,
        });
      continue;
    }
    const answer = map.get(key);
    let status = "Needs an answer";
    if (answer !== undefined) {
      status = "Saved answer available";
      if (mode === "fill") {
        if (type === "radio") {
          const matches = members.filter(
            (member) => normalize(labelFor(member)) === normalize(answer),
          );
          if (matches.length !== 1) status = "No unique option matches; answer manually";
          else if (members.some((member) => member.checked) && !matches[0].checked)
            status = "Existing answer preserved";
          else {
            matches[0].checked = true;
            matches[0].dispatchEvent(new Event("input", { bubbles: true }));
            matches[0].dispatchEvent(new Event("change", { bubbles: true }));
            status = "Filled; verify";
          }
        } else if (el.value.trim()) status = "Existing answer preserved";
        else if (type === "select") {
          const matches = [...el.options].filter(
            (o) =>
              !o.disabled && !o.parentElement?.disabled && normalize(o.text) === normalize(answer),
          );
          if (matches.length !== 1) status = "No unique option matches; answer manually";
          else {
            change(el, matches[0].value);
            status = "Filled; verify";
          }
        } else if (type === "number" && (!answer.trim() || !Number.isFinite(Number(answer))))
          status = "Saved answer is not a number; answer manually";
        else if (el.maxLength >= 0 && answer.length > el.maxLength)
          status = "Answer exceeds field limit; answer manually";
        else {
          change(el, answer);
          status = el.validity.valid
            ? "Filled; verify"
            : "Filled but validation failed; review manually";
        }
      }
    }
    if (answer === undefined || status.startsWith("No unique"))
      questions.push({
        key,
        label,
        required: members.some((m) => m.required || m.getAttribute("aria-required") === "true"),
        options,
        type,
      });
    results.push({ label, status });
  }
  if (document.querySelector("iframe"))
    results.push({
      label: "Embedded form",
      status: "Embedded frames are not scanned; handle manually",
    });
  return { questions, results };
}

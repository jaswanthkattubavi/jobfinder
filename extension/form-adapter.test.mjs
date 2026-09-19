import test from "node:test";
import assert from "node:assert/strict";
import { inspectForm } from "./form-adapter.mjs";

test("fills only exact approved questions and preserves manual/sensitive answers", () => {
  class Input {
    constructor(label, value = "", type = "text", name = "") {
      Object.assign(this, {
        labels: [{ textContent: label }],
        _value: value,
        type,
        name,
        id: name,
        autocomplete: "",
        tagName: "INPUT",
        maxLength: -1,
        validity: { valid: true },
        required: false,
      });
    }
    get value() {
      return this._value;
    }
    set value(value) {
      this._value = value;
    }
    getClientRects() {
      return [1];
    }
    getAttribute() {
      return null;
    }
    closest() {
      return null;
    }
    dispatchEvent() {
      return true;
    }
  }
  const controls = [
    new Input("First name"),
    new Input("Last name", "Existing"),
    new Input("First and middle name"),
    new Input("Verification code"),
    new Input("Card details", "", "text", "cc-number"),
    new Input("Email consent", "", "checkbox"),
  ];
  const originals = Object.fromEntries(
    [
      "location",
      "document",
      "getComputedStyle",
      "HTMLInputElement",
      "HTMLSelectElement",
      "HTMLTextAreaElement",
    ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  try {
    globalThis.location = { href: "https://example.com/apply?job=1" };
    globalThis.document = {
      querySelectorAll: () => controls,
      querySelector: () => null,
      getElementById: () => null,
      forms: [],
    };
    globalThis.getComputedStyle = () => ({ visibility: "visible" });
    globalThis.HTMLInputElement = Input;
    globalThis.HTMLSelectElement = Input;
    globalThis.HTMLTextAreaElement = Input;
    const result = inspectForm({
      mode: "fill",
      expectedUrl: location.href,
      answers: [
        { question: "First name", answer: "Alex" },
        { question: "Last name", answer: "Overwrite" },
        { question: "Verification code", answer: "123456" },
        { question: "Card details", answer: "1234" },
        { question: "Email consent", answer: "yes" },
      ],
    });
    assert.equal(controls[0].value, "Alex");
    assert.equal(controls[1].value, "Existing");
    for (const control of controls.slice(2)) assert.equal(control.value, "");
    assert.equal(result.questions.length, 2);
    assert.equal(result.questions[0].label, "First and middle name");
    assert.equal(result.questions[1].label, "Email consent");
    assert.equal(result.questions[1].manual, true);
    assert.throws(
      () =>
        inspectForm({ mode: "fill", expectedUrl: "https://example.com/apply?job=2", answers: [] }),
      /page changed/,
    );
    assert.throws(
      () =>
        inspectForm({
          mode: "fill",
          expectedUrl: location.href,
          answers: [],
          expiresAt: "2000-01-01T00:00:00Z",
        }),
      /expired/,
    );
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

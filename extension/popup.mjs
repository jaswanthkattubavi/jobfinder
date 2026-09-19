import { validatePacket, reusableAnswers, sameApplicationUrl } from "./helpers.mjs";
import { inspectForm } from "./form-adapter.mjs";
const $ = (id) => document.getElementById(id);
let packet = null,
  questions = [];
const status = (message) => {
  $("status").textContent = message;
};
function reset() {
  packet = null;
  questions = [];
  for (const id of ["scan", "fill", "export", "cv"]) $(id).disabled = true;
  $("packet").value = "";
  $("job").textContent = "";
  $("results").replaceChildren();
  status("No packet loaded. Data stays in this popup and clears when it closes.");
}
function download(content, name, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("packet").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  reset();
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("Packet is too large (2 MB limit).");
    packet = validatePacket(JSON.parse(await file.text()));
    $("job").textContent = `${packet.job.title} · ${packet.job.company}`;
    $("scan").disabled = false;
    $("cv").disabled = false;
    status("Packet loaded. Open its exact application page and scan questions.");
  } catch (error) {
    reset();
    status(error.message);
  }
});
async function run(mode) {
  if (!packet) return;
  $("fill").disabled = true;
  $("export").disabled = true;
  try {
    validatePacket(packet);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!sameApplicationUrl(tab.url, packet.job.applyUrl))
      throw new Error(
        "Wrong page. Open the exact application URL in this packet first. Redirected forms need an updated packet URL.",
      );
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inspectForm,
      args: [
        {
          mode,
          answers: reusableAnswers(packet),
          expectedUrl: packet.job.applyUrl,
          expiresAt: packet.expiresAt,
        },
      ],
    });
    questions = result.questions;
    $("results").replaceChildren(
      ...result.results.map((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label}: ${item.status}`;
        return li;
      }),
    );
    $("fill").disabled = !result.results.length;
    $("export").disabled = !questions.length;
    status(
      `${result.results.length} controls reviewed; ${questions.length} questions need answers. ${mode === "fill" ? "Review all answers on the page. Nothing was submitted." : "Only exact saved question matches will be filled."}`,
    );
  } catch (error) {
    status(error.message);
  }
}
$("scan").addEventListener("click", () => run("scan"));
$("fill").addEventListener("click", () => run("fill"));
$("export").addEventListener("click", () =>
  download(
    JSON.stringify({ version: 1, taskId: packet.taskId, questions }, null, 2),
    "jobfinder-unanswered.json",
    "application/json",
  ),
);
$("cv").addEventListener("click", () =>
  download(packet.cvText, "jobfinder-cv-reference.txt", "text/plain"),
);
$("clear").addEventListener("click", reset);

export const normalize = (value) =>
  String(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s*?:.]+$/g, "")
    .trim();

export function sameApplicationUrl(current, expected) {
  try {
    const a = new URL(current),
      b = new URL(expected);
    return (
      b.protocol === "https:" &&
      a.origin === b.origin &&
      a.pathname === b.pathname &&
      [...b.searchParams.keys()].every(
        (key) =>
          JSON.stringify(a.searchParams.getAll(key)) === JSON.stringify(b.searchParams.getAll(key)),
      ) &&
      (!b.hash || a.hash === b.hash)
    );
  } catch {
    return false;
  }
}

export function validatePacket(packet) {
  if (
    !packet ||
    packet.version !== 1 ||
    typeof packet.taskId !== "string" ||
    !packet.taskId.trim() ||
    !packet.job ||
    !["title", "company", "applyUrl"].every(
      (k) => typeof packet.job[k] === "string" && packet.job[k].trim(),
    ) ||
    typeof packet.cvText !== "string" ||
    !Array.isArray(packet.answers) ||
    packet.answers.length > 500
  )
    throw new Error("Invalid version 1 application packet.");
  const url = new URL(packet.job.applyUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Application URL must be an HTTPS URL without credentials.");
  if (
    packet.expiresAt !== undefined &&
    (typeof packet.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(packet.expiresAt)) ||
      Date.parse(packet.expiresAt) <= Date.now())
  )
    throw new Error(
      "Application packet has expired or has an invalid expiry. Download a fresh packet.",
    );
  const seen = new Map();
  for (const answer of packet.answers) {
    if (
      !answer ||
      typeof answer.question !== "string" ||
      !normalize(answer.question) ||
      typeof answer.answer !== "string" ||
      typeof answer.scope !== "string" ||
      typeof answer.reuse !== "boolean" ||
      answer.answer.length > 10000
    )
      throw new Error("Invalid answer in packet.");
    if (!answer.reuse || !["global", "application", packet.taskId].includes(answer.scope)) continue;
    const key = normalize(answer.question);
    if (seen.has(key) && seen.get(key) !== answer.answer)
      throw new Error(`Conflicting answers for: ${answer.question}`);
    seen.set(key, answer.answer);
  }
  return packet;
}

export function reusableAnswers(packet) {
  return packet.answers.filter(
    (answer) => answer.reuse && ["global", "application", packet.taskId].includes(answer.scope),
  );
}

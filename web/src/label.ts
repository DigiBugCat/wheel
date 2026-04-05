// Godot's [wave][rainbow] BBCode: each char bobs up/down and cycles through hues.
// We reproduce this by wrapping each character in a span with staggered animation delays.

export function setRainbowWaveText(el: HTMLElement, text: string) {
  el.replaceChildren();
  const chars = [...text];
  chars.forEach((ch, i) => {
    if (ch === " ") {
      el.append(" ");
      return;
    }
    const span = document.createElement("span");
    span.className = "rw-char";
    span.textContent = ch;
    // stagger wave + rainbow across characters
    // wave: slight stagger per char; rainbow: 0.12s per char at 1.2s cycle = 36° hue offset per char
    span.style.animationDelay = `${i * 0.08}s, ${i * 0.12}s`;
    el.appendChild(span);
  });
}

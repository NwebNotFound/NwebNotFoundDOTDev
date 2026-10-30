import { resolveIcon } from "../src/mc-icon.js";
const ids = process.argv.slice(2);
console.log(ids.filter((i) => !resolveIcon(i)).join(" ") || "alle ok");

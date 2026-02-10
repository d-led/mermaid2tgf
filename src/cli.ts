import { convertInputToOutput } from "./converter";

declare const globalThis: { convertInputToOutput?: (text: string) => string };
globalThis.convertInputToOutput = convertInputToOutput;

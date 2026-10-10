// Jest setup (picked up automatically by react-scripts).
import { TextEncoder, TextDecoder } from "util";
import "@testing-library/jest-dom";

// react-router 7 expects these web globals, which jsdom does not provide.
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

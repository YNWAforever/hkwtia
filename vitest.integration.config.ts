import config from "./vitest.config";
import {mergeConfig} from "vitest/config";

export default mergeConfig(config, {test: {include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"]}});

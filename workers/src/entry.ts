// Workerd treats named exports as entrypoints. Keep test/config constants in index.ts.
import worker from "./index";
export default worker;

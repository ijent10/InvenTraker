import { EngineError } from "../contracts.ts"
export function assertInventoryWritesEnabled(value = process.env.INVENTORY_WRITES_ENABLED) {
  if (value === "false") throw new EngineError("Stock changes are temporarily paused. Your counts have not been saved. Try again after your administrator restores inventory writes.", 503, "inventory_read_only")
}

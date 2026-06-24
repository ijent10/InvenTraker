"use client"

import { Plus } from "lucide-react"

import { Button, Panel } from "@/components/ui"

export function InventoryForm() {
  return (
    <Panel className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Add inventory item</h2>
          <p className="mt-1 text-sm text-slate-400">Defaults are set to eaches and no expiration.</p>
        </div>
        <Plus className="h-5 w-5 text-blue-300" />
      </div>

      <form className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-300">
          Item name
          <input className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="text-sm font-semibold text-slate-300">
          SKU or barcode
          <input className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="text-sm font-semibold text-slate-300">
          Department
          <input className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="text-sm font-semibold text-slate-300">
          Location
          <input className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500" />
        </label>
        <label className="text-sm font-semibold text-slate-300">
          Unit
          <select className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500">
            <option>eaches</option>
            <option>cases</option>
            <option>pounds</option>
            <option>ounces</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-300">
          Expiration
          <select className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-blue-500">
            <option>No expiration</option>
            <option>Tracks expiration</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <Button>Add item</Button>
        </div>
      </form>
    </Panel>
  )
}

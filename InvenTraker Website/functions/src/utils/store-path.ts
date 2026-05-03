import { adminDb } from "../lib/firebase.js"

export type StorePath = { regionId: string; districtId: string; storeId: string }

export async function findStorePath(orgId: string, storeId: string): Promise<StorePath | null> {
  const regions = await adminDb.collection(`organizations/${orgId}/regions`).get()
  for (const region of regions.docs) {
    const districts = await adminDb.collection(`organizations/${orgId}/regions/${region.id}/districts`).get()
    for (const district of districts.docs) {
      const store = await adminDb
        .doc(`organizations/${orgId}/regions/${region.id}/districts/${district.id}/stores/${storeId}`)
        .get()
      if (store.exists) {
        return { regionId: region.id, districtId: district.id, storeId }
      }
    }
  }
  return null
}

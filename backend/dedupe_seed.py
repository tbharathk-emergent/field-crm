"""One-shot cleanup: removes duplicate seed rows caused by multi-worker races.

Run this ONCE on production after upgrading to the version with unique indexes:

    cd /var/www/field-crm/backend
    source venv/bin/activate
    python -m dedupe_seed

It keeps the oldest document (by created_at) for each duplicate group and deletes the rest.
"""
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def dedupe(coll, key_fields, label):
    """Keep the earliest doc per key group; remove the rest."""
    pipeline = [
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": {k: f"${k}" for k in key_fields},
            "keep_id": {"$first": "$_id"},
            "all_ids": {"$push": "$_id"},
            "count": {"$sum": 1},
        }},
        {"$match": {"count": {"$gt": 1}}},
    ]
    removed = 0
    async for grp in coll.aggregate(pipeline):
        dupes = [i for i in grp["all_ids"] if i != grp["keep_id"]]
        if dupes:
            res = await coll.delete_many({"_id": {"$in": dupes}})
            removed += res.deleted_count
    print(f"  {label}: removed {removed} duplicates")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print("Cleaning duplicates...")
    await dedupe(db.tenants, ["slug"], "tenants (by slug)")
    await dedupe(db.plans, ["code"], "plans (by code)")
    await dedupe(db.users, ["tenant_id", "phone"], "users (by tenant+phone)")
    await dedupe(db.roles, ["tenant_id", "name"], "roles (by tenant+name)")
    await dedupe(db.areas, ["tenant_id", "name", "parent_id"], "areas (by tenant+name+parent)")
    await dedupe(db.products, ["tenant_id", "name"], "products (by tenant+name)")
    await dedupe(db.targets, ["tenant_id", "user_id", "month"], "targets (by tenant+user+month)")
    await dedupe(db.platform_settings, ["id"], "platform_settings")

    print("\nDone. You can now start the server with any number of workers.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())

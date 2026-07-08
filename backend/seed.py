"""Seed default plans, demo tenant, demo users. Safe under multi-worker startup:
all duplicate-key errors are silently swallowed since unique indexes protect us."""
import os
from datetime import datetime, timezone, timedelta
from pymongo.errors import DuplicateKeyError
from models import (
    Plan, Tenant, TenantTheme, TenantLabels, User, Product, PlatformSettings,
    AreaNode, Role, Target, PERMISSION_MODULES, now_iso, gen_id,
    Crop, AdvisoryEntry, SeasonalAdvisory,
)


async def _safe_insert(coll, doc):
    try:
        await coll.insert_one(doc)
        return True
    except DuplicateKeyError:
        return False


DEFAULT_PLANS = [
    {"name": "Free Trial", "code": "free_trial", "price_monthly": 0, "price_yearly": 0,
     "max_employees": 5, "max_managers": 1, "max_dealers": 50, "max_products": 50,
     "storage_mb": 250, "gps_tracking": True, "reports_enabled": True,
     "push_notifications": True, "customer_app_enabled": True},
    {"name": "Starter Monthly", "code": "monthly", "price_monthly": 999, "price_yearly": 0,
     "max_employees": 20, "max_managers": 3, "max_dealers": 500, "max_products": 200,
     "storage_mb": 2000, "gps_tracking": True, "reports_enabled": True,
     "push_notifications": True, "customer_app_enabled": True},
    {"name": "Growth Yearly", "code": "yearly", "price_monthly": 0, "price_yearly": 9999,
     "max_employees": 50, "max_managers": 10, "max_dealers": 2000, "max_products": 1000,
     "storage_mb": 10000, "gps_tracking": True, "reports_enabled": True,
     "push_notifications": True, "customer_app_enabled": True},
    {"name": "Enterprise Custom", "code": "custom", "price_monthly": 0, "price_yearly": 0,
     "max_employees": 10000, "max_managers": 1000, "max_dealers": 100000, "max_products": 100000,
     "storage_mb": 100000, "gps_tracking": True, "reports_enabled": True,
     "push_notifications": True, "customer_app_enabled": True},
]


async def seed_all(db):
    # 1) Plans
    if await db.plans.count_documents({}) == 0:
        for p in DEFAULT_PLANS:
            plan = Plan(**p)
            await _safe_insert(db.plans, plan.model_dump())

    # 2) Platform settings
    if await db.platform_settings.find_one({"id": "platform"}) is None:
        await _safe_insert(db.platform_settings, PlatformSettings().model_dump())

    # 3) Super admin user
    sa_phone = os.environ.get("SUPER_ADMIN_PHONE", "9858558555")
    existing_sa = await db.users.find_one({"phone": sa_phone, "role": "super_admin"})
    if not existing_sa:
        sa = User(phone=sa_phone, name="Super Admin", role="super_admin", tenant_id=None,
                  email="admin@localappstore.in")
        await _safe_insert(db.users, sa.model_dump())

    # 4) Demo tenant
    demo_tenant = await db.tenants.find_one({"slug": "demo"})
    if not demo_tenant:
        free_plan = await db.plans.find_one({"code": "yearly"})
        tenant = Tenant(
            slug="demo",
            name="Akshara Agro",
            business_type="Agriculture",
            theme=TenantTheme(primary="#2C5E43", secondary="#D35400", primary_hover="#1e422f"),
            labels=TenantLabels(customer="Farmer", customer_plural="Farmers",
                                dealer="Dealer", dealer_plural="Dealers",
                                product="Product", product_plural="Products"),
            default_language="en",
            plan_id=free_plan["id"] if free_plan else None,
            plan_status="active",
            trial_ends_at=(datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            contact_email="admin@akshara.demo",
            contact_phone="9000000001",
            address="Hyderabad, Telangana",
            features={"crop_advisor": True},
        )
        await _safe_insert(db.tenants, tenant.model_dump())
        tenant_id = tenant.id

        # 5) Demo users for the demo tenant
        admin = User(tenant_id=tenant_id, phone="9000000001", name="Ravi Kumar",
                     role="tenant_admin", email="admin@akshara.demo")
        await _safe_insert(db.users, admin.model_dump())

        manager = User(tenant_id=tenant_id, phone="9000000002", name="Suresh Reddy",
                       role="manager", employee_code="MGR001", area="Telangana")
        await _safe_insert(db.users, manager.model_dump())

        employee = User(tenant_id=tenant_id, phone="9000000003", name="Anil Sharma",
                        role="employee", employee_code="EMP001",
                        manager_id=manager.id, area="Hyderabad North")
        await _safe_insert(db.users, employee.model_dump())

        employee2 = User(tenant_id=tenant_id, phone="9000000005", name="Priya Patel",
                         role="employee", employee_code="EMP002",
                         manager_id=manager.id, area="Hyderabad South")
        await _safe_insert(db.users, employee2.model_dump())

        customer = User(tenant_id=tenant_id, phone="9000000004", name="Ramesh Naidu",
                        role="dealer", business_name="Naidu Krishi Kendra",
                        dealer_code="DLR001", village="Karimnagar",
                        district="Karimnagar", state="Telangana", pincode="505001",
                        assigned_employee_id=employee.id, credit_limit=50000,
                        outstanding_amount=12500)
        await _safe_insert(db.users, customer.model_dump())

        customer2 = User(tenant_id=tenant_id, phone="9000000006", name="Lakshmi Devi",
                         role="dealer", business_name="Devi Agro Centre",
                         dealer_code="DLR002", village="Warangal",
                         district="Warangal", state="Telangana", pincode="506001",
                         assigned_employee_id=employee.id, credit_limit=30000,
                         outstanding_amount=5000)
        await _safe_insert(db.users, customer2.model_dump())

        # Real End-Customers (Farmers) - B2C
        farmer1 = User(tenant_id=tenant_id, phone="9000000007", name="Venkat Rao",
                       role="customer", village="Karimnagar",
                       district="Karimnagar", state="Telangana", pincode="505001",
                       assigned_employee_id=employee.id,
                       farm_size_acres=5.5, crops="Cotton, Paddy")
        await _safe_insert(db.users, farmer1.model_dump())

        farmer2 = User(tenant_id=tenant_id, phone="9000000008", name="Saraswati Bai",
                       role="customer", village="Warangal",
                       district="Warangal", state="Telangana", pincode="506001",
                       assigned_employee_id=employee.id,
                       farm_size_acres=3.0, crops="Chilli, Turmeric")
        await _safe_insert(db.users, farmer2.model_dump())

        # 6) Demo products
        sample_products = [
            {"name": "BioRoot Plus", "code": "BRP-500", "category": "Bio Fertilizer",
             "description": "Organic root growth booster", "dosage": "2ml per liter",
             "packing": "500ml", "mrp": 350, "price": 320, "stock": 200},
            {"name": "CropShield Pro", "code": "CSP-1L", "category": "Pesticide",
             "description": "Broad spectrum crop protection", "dosage": "1ml per liter",
             "packing": "1 Litre", "mrp": 850, "price": 780, "stock": 150},
            {"name": "GreenGrow NPK", "code": "GG-50KG", "category": "Fertilizer",
             "description": "Balanced NPK fertilizer 19-19-19", "dosage": "Per soil test",
             "packing": "50 Kg", "mrp": 1450, "price": 1380, "stock": 80},
            {"name": "PestAway Spray", "code": "PA-250", "category": "Pesticide",
             "description": "Aphid and whitefly control", "dosage": "3ml per liter",
             "packing": "250ml", "mrp": 220, "price": 195, "stock": 300},
            {"name": "SoilBoost Granules", "code": "SB-10KG", "category": "Soil Conditioner",
             "description": "Improves soil structure and nutrients", "dosage": "10kg per acre",
             "packing": "10 Kg", "mrp": 650, "price": 595, "stock": 120},
        ]
        for sp in sample_products:
            prod = Product(tenant_id=tenant_id, **sp)
            await _safe_insert(db.products, prod.model_dump())

        # 7) Phase 2: Area Hierarchy (Country → State → District → Area)
        india = AreaNode(tenant_id=tenant_id, name="India", type="country", path=[])
        await _safe_insert(db.areas, india.model_dump())
        telangana = AreaNode(tenant_id=tenant_id, name="Telangana", type="state",
                              parent_id=india.id, path=[india.id])
        await _safe_insert(db.areas, telangana.model_dump())
        ap = AreaNode(tenant_id=tenant_id, name="Andhra Pradesh", type="state",
                      parent_id=india.id, path=[india.id])
        await _safe_insert(db.areas, ap.model_dump())
        hyd = AreaNode(tenant_id=tenant_id, name="Hyderabad", type="district",
                       parent_id=telangana.id, path=[india.id, telangana.id])
        await _safe_insert(db.areas, hyd.model_dump())
        wgl = AreaNode(tenant_id=tenant_id, name="Warangal", type="district",
                       parent_id=telangana.id, path=[india.id, telangana.id])
        await _safe_insert(db.areas, wgl.model_dump())
        krg = AreaNode(tenant_id=tenant_id, name="Karimnagar", type="district",
                       parent_id=telangana.id, path=[india.id, telangana.id])
        await _safe_insert(db.areas, krg.model_dump())
        hyd_n = AreaNode(tenant_id=tenant_id, name="Hyderabad North", type="area",
                         parent_id=hyd.id, path=[india.id, telangana.id, hyd.id])
        await _safe_insert(db.areas, hyd_n.model_dump())
        hyd_s = AreaNode(tenant_id=tenant_id, name="Hyderabad South", type="area",
                         parent_id=hyd.id, path=[india.id, telangana.id, hyd.id])
        await _safe_insert(db.areas, hyd_s.model_dump())

        # Assign areas to demo users
        await db.users.update_one({"id": manager.id}, {"$set": {"area_node_id": telangana.id}})
        await db.users.update_one({"id": employee.id}, {"$set": {"area_node_id": hyd_n.id}})
        await db.users.update_one({"id": employee2.id}, {"$set": {"area_node_id": hyd_s.id}})

        # 8) Phase 2: Default custom roles
        full = {m: {"read": True, "write": True} for m in PERMISSION_MODULES}
        view_only = {m: {"read": True, "write": False} for m in PERMISSION_MODULES}

        sales_role_perm = {m: {"read": False, "write": False} for m in PERMISSION_MODULES}
        for m in ("visits", "sales", "collections", "dcr", "enquiries",
                   "dealers", "customers", "products", "leaves", "orders"):
            sales_role_perm[m] = {"read": True, "write": True}

        sales_role = Role(tenant_id=tenant_id, name="Sales Executive",
                          description="Standard field sales staff with full activity write access",
                          permissions=sales_role_perm, is_default=True)
        await _safe_insert(db.roles, sales_role.model_dump())

        readonly_perm = {m: {"read": False, "write": False} for m in PERMISSION_MODULES}
        for m in ("visits", "sales", "collections", "dcr", "enquiries", "dealers", "customers", "products", "leaves"):
            readonly_perm[m] = {"read": True, "write": False}
        readonly_role = Role(tenant_id=tenant_id, name="Read-Only Observer",
                             description="Can see entries but not create them",
                             permissions=readonly_perm)
        await _safe_insert(db.roles, readonly_role.model_dump())

        # Assign default sales role to seeded employees
        await db.users.update_one({"id": employee.id}, {"$set": {"role_id": sales_role.id}})
        await db.users.update_one({"id": employee2.id}, {"$set": {"role_id": sales_role.id}})

        # 9) Phase 2: Sample monthly target for current month for seeded employees
        cur_month = datetime.now(timezone.utc).strftime("%Y-%m")
        for emp_id, emp_name, tgt in [(employee.id, employee.name, 50000),
                                       (employee2.id, employee2.name, 40000)]:
            t = Target(tenant_id=tenant_id, user_id=emp_id, user_name=emp_name,
                       month=cur_month, sales_target=tgt)
            await _safe_insert(db.targets, t.model_dump())



    # ---- Idempotent Phase 2 backfill for demo tenant ----
    demo = await db.tenants.find_one({"slug": "demo"})
    if demo:
        tid = demo["id"]
        # ---- MIGRATION: split dealer vs customer ----
        # Legacy users with role="customer" AND non-empty dealer_code -> promote to role="dealer".
        # This preserves the b2b user data and separates it cleanly from B2C farmers.
        await db.users.update_many(
            {"tenant_id": tid, "role": "customer",
             "dealer_code": {"$nin": [None, ""]}},
            {"$set": {"role": "dealer"}},
        )
        # Repair: any user with farm_size_acres set OR crops set should be role="customer"
        await db.users.update_many(
            {"tenant_id": tid, "role": "dealer",
             "$or": [{"farm_size_acres": {"$ne": None}}, {"crops": {"$nin": [None, ""]}}]},
            {"$set": {"role": "customer"}},
        )
        # Seed farmer customers idempotently
        for phone, name, village, district, acres, crops in [
            ("9000000007", "Venkat Rao", "Karimnagar", "Karimnagar", 5.5, "Cotton, Paddy"),
            ("9000000008", "Saraswati Bai", "Warangal", "Warangal", 3.0, "Chilli, Turmeric"),
        ]:
            existing = await db.users.find_one({"tenant_id": tid, "phone": phone})
            if not existing:
                emp = await db.users.find_one({"tenant_id": tid, "phone": "9000000003"})
                f = User(tenant_id=tid, phone=phone, name=name, role="customer",
                         village=village, district=district, state="Telangana",
                         farm_size_acres=acres, crops=crops,
                         assigned_employee_id=emp["id"] if emp else None)
                await _safe_insert(db.users, f.model_dump())
        # If no areas yet for this tenant, build hierarchy + assign employees
        if await db.areas.count_documents({"tenant_id": tid}) == 0:
            india = AreaNode(tenant_id=tid, name="India", type="country", path=[])
            await _safe_insert(db.areas, india.model_dump())
            telangana = AreaNode(tenant_id=tid, name="Telangana", type="state",
                                  parent_id=india.id, path=[india.id])
            await _safe_insert(db.areas, telangana.model_dump())
            ap = AreaNode(tenant_id=tid, name="Andhra Pradesh", type="state",
                          parent_id=india.id, path=[india.id])
            await _safe_insert(db.areas, ap.model_dump())
            hyd = AreaNode(tenant_id=tid, name="Hyderabad", type="district",
                           parent_id=telangana.id, path=[india.id, telangana.id])
            await _safe_insert(db.areas, hyd.model_dump())
            wgl = AreaNode(tenant_id=tid, name="Warangal", type="district",
                           parent_id=telangana.id, path=[india.id, telangana.id])
            await _safe_insert(db.areas, wgl.model_dump())
            krg = AreaNode(tenant_id=tid, name="Karimnagar", type="district",
                           parent_id=telangana.id, path=[india.id, telangana.id])
            await _safe_insert(db.areas, krg.model_dump())
            hyd_n = AreaNode(tenant_id=tid, name="Hyderabad North", type="area",
                             parent_id=hyd.id, path=[india.id, telangana.id, hyd.id])
            await _safe_insert(db.areas, hyd_n.model_dump())
            hyd_s = AreaNode(tenant_id=tid, name="Hyderabad South", type="area",
                             parent_id=hyd.id, path=[india.id, telangana.id, hyd.id])
            await _safe_insert(db.areas, hyd_s.model_dump())

            # Assign by phone (idempotent)
            await db.users.update_one({"tenant_id": tid, "phone": "9000000002"},
                                      {"$set": {"area_node_id": telangana.id}})
            await db.users.update_one({"tenant_id": tid, "phone": "9000000003"},
                                      {"$set": {"area_node_id": hyd_n.id}})
            await db.users.update_one({"tenant_id": tid, "phone": "9000000005"},
                                      {"$set": {"area_node_id": hyd_s.id}})

        # Default roles
        if await db.roles.count_documents({"tenant_id": tid}) == 0:
            sales_role_perm = {m: {"read": False, "write": False} for m in PERMISSION_MODULES}
            for m in ("visits", "sales", "collections", "dcr", "enquiries",
                       "dealers", "customers", "products", "leaves", "orders"):
                sales_role_perm[m] = {"read": True, "write": True}
            sales_role = Role(tenant_id=tid, name="Sales Executive",
                              description="Standard field sales staff with full activity write access",
                              permissions=sales_role_perm, is_default=True)
            await _safe_insert(db.roles, sales_role.model_dump())

            readonly_perm = {m: {"read": False, "write": False} for m in PERMISSION_MODULES}
            for m in ("visits", "sales", "collections", "dcr", "enquiries",
                       "dealers", "customers", "products", "leaves"):
                readonly_perm[m] = {"read": True, "write": False}
            readonly_role = Role(tenant_id=tid, name="Read-Only Observer",
                                 description="Can see entries but not create them",
                                 permissions=readonly_perm)
            await _safe_insert(db.roles, readonly_role.model_dump())

            await db.users.update_one({"tenant_id": tid, "phone": "9000000003"},
                                      {"$set": {"role_id": sales_role.id}})
            await db.users.update_one({"tenant_id": tid, "phone": "9000000005"},
                                      {"$set": {"role_id": sales_role.id}})

        # Current month targets
        cur_month = datetime.now(timezone.utc).strftime("%Y-%m")
        for phone, tgt in [("9000000003", 50000), ("9000000005", 40000)]:
            udoc = await db.users.find_one({"tenant_id": tid, "phone": phone})
            if not udoc:
                continue
            existing = await db.targets.find_one({"tenant_id": tid, "user_id": udoc["id"], "month": cur_month})
            if not existing:
                t = Target(tenant_id=tid, user_id=udoc["id"],
                           user_name=udoc.get("name", ""), month=cur_month, sales_target=tgt)
                await _safe_insert(db.targets, t.model_dump())

        # ---- Crop Advisor: enable feature + seed crops/advisories ----
        if not (demo.get("features") or {}).get("crop_advisor"):
            await db.tenants.update_one(
                {"id": tid},
                {"$set": {"features": {**(demo.get("features") or {}), "crop_advisor": True}}},
            )

        crop_seed = [
            ("Paddy", "Oryza sativa", "Kharif", "Staple cereal — grown across India in Kharif season."),
            ("Cotton", "Gossypium hirsutum", "Kharif", "Major cash crop — heavy pest pressure."),
            ("Chilli", "Capsicum annuum", "Kharif/Rabi", "Spice crop — thrips + viral disease prone."),
            ("Tomato", "Solanum lycopersicum", "Rabi", "Vegetable — early blight & fruit borer common."),
            ("Groundnut", "Arachis hypogaea", "Kharif", "Oilseed — leaf spot & aphid risk."),
            ("Maize", "Zea mays", "Kharif", "Cereal — fall armyworm major threat."),
            ("Banana", "Musa paradisiaca", "Perennial", "Fruit — panama wilt, sigatoka."),
            ("Mango", "Mangifera indica", "Perennial", "Fruit — anthracnose & hopper."),
            ("Onion", "Allium cepa", "Rabi", "Bulb crop — purple blotch."),
            ("Turmeric", "Curcuma longa", "Kharif", "Spice — rhizome rot."),
        ]
        crop_id_map: dict = {}
        for idx, (nm, sci, seas, desc) in enumerate(crop_seed):
            existing = await db.crops.find_one({"tenant_id": tid, "name": nm})
            if existing:
                crop_id_map[nm] = existing["id"]
                continue
            c = Crop(tenant_id=tid, name=nm, scientific_name=sci, season=seas,
                     description=desc, order=idx)
            await _safe_insert(db.crops, c.model_dump())
            crop_id_map[nm] = c.id

        # A minimal set of advisory entries for Paddy, Cotton, Chilli
        # Only insert if collection is currently empty (idempotent)
        if await db.advisory_entries.count_documents({"tenant_id": tid}) == 0:
            paddy_id = crop_id_map.get("Paddy")
            cotton_id = crop_id_map.get("Cotton")
            chilli_id = crop_id_map.get("Chilli")

            samples = [
                {
                    "type": "disease", "name": "Rice Blast",
                    "scientific_name": "Magnaporthe oryzae", "crop_ids": [paddy_id] if paddy_id else [],
                    "category": "fungal", "severity": "high",
                    "short_description": "Diamond-shaped grey lesions on leaves & neck rot.",
                    "description": "One of the most destructive fungal diseases of rice worldwide.",
                    "season": "Kharif",
                    "symptoms": ["Diamond-shaped spots on leaves", "Grey-white lesion centers",
                                  "Neck rot at panicle base", "Empty grains"],
                    "causes": "Fungus thrives in wet, humid weather with dew and low night temps.",
                    "spread": ["wind", "water", "seed"],
                    "weather": {"temperature": "25-28°C", "humidity": ">90%",
                                 "rainfall": "Frequent", "season": "Kharif"},
                    "prevention": ["Use resistant varieties", "Balanced fertilization — avoid excess N",
                                    "Field sanitation", "Seed treatment"],
                    "organic_treatment": "Neem oil spray, Trichoderma soil application, silica fertilization.",
                    "bio_control": "Pseudomonas fluorescens seed treatment @10g/kg seed.",
                    "natural_remedies": "Cow urine + garlic + chilli extract as leaf spray.",
                    "chemical_treatment": {
                        "product_name": "Tricyclazole 75% WP", "active_ingredient": "Tricyclazole",
                        "dosage": "0.6 g/L", "water_quantity": "200 L/acre",
                        "spray_interval": "10-15 days", "max_applications": "3",
                        "waiting_period": "21 days"
                    },
                    "safety": {"ppe": ["Gloves", "Mask", "Goggles", "Full sleeves"],
                                "dos": ["Spray in morning/evening", "Wash hands after use"],
                                "donts": ["Do not eat/drink while spraying", "Do not spray in wind"],
                                "first_aid": "In case of skin contact — wash with soap; eye — flush with water 15 min.",
                                "storage": "Cool dry place, out of reach of children."},
                    "faqs": [{"q": "When to spray?", "a": "At first sign of leaf spots or when weather turns humid."},
                              {"q": "Can I mix with other pesticides?", "a": "Consult local agronomist."}],
                    "keywords": ["blast", "leaf spot", "paddy", "rice", "neck rot"],
                    "is_published": True,
                },
                {
                    "type": "pest", "name": "Pink Bollworm",
                    "scientific_name": "Pectinophora gossypiella",
                    "crop_ids": [cotton_id] if cotton_id else [],
                    "category": "pest", "severity": "high",
                    "short_description": "Larvae feed inside cotton bolls damaging seed and lint.",
                    "season": "Kharif",
                    "symptoms": ["Rosette flowers", "Green bolls with entry holes",
                                  "Discoloured lint", "Reduced boll weight"],
                    "causes": "Adult moth lays eggs on flower buds. Larva enters boll and feeds inside.",
                    "spread": ["wind", "insects"],
                    "weather": {"temperature": "25-32°C", "humidity": "60-80%",
                                 "rainfall": "Variable", "season": "Kharif late"},
                    "prevention": ["Pheromone traps @5/acre", "Timely sowing", "Destroy crop stubble",
                                    "Rotation with non-host crop"],
                    "organic_treatment": "Neem seed kernel extract 5% + Beauveria bassiana.",
                    "chemical_treatment": {
                        "product_name": "Emamectin Benzoate 5% SG", "active_ingredient": "Emamectin",
                        "dosage": "0.4 g/L", "water_quantity": "200 L/acre",
                        "spray_interval": "12 days", "max_applications": "3", "waiting_period": "7 days"
                    },
                    "safety": {"ppe": ["Gloves", "Mask"], "dos": ["Spray in evening"],
                                "donts": ["Don't spray during flowering peak"],
                                "first_aid": "Wash exposed area with soap.", "storage": "Locked cabinet."},
                    "keywords": ["bollworm", "cotton", "moth", "pink"],
                    "is_published": True,
                },
                {
                    "type": "deficiency", "name": "Nitrogen Deficiency",
                    "crop_ids": [paddy_id, cotton_id, chilli_id] if paddy_id else [],
                    "category": "nutrient_deficiency", "severity": "medium",
                    "short_description": "Yellowing of older leaves + stunted growth.",
                    "symptoms": ["Pale yellow older leaves", "Stunted growth",
                                  "Reduced tillering", "Low yield"],
                    "causes": "Insufficient nitrogen supply — leaching, sandy soils, low organic matter.",
                    "prevention": ["Balanced NPK", "Green manuring", "FYM 5 t/acre"],
                    "organic_treatment": "Vermicompost, cattle manure, urea foliar spray 1%.",
                    "chemical_treatment": {"product_name": "Urea 46% N",
                                             "dosage": "40-60 kg/acre split doses",
                                             "waiting_period": "N/A"},
                    "keywords": ["yellow leaves", "stunted", "deficiency", "N"],
                    "is_published": True,
                },
            ]
            for s in samples:
                e = AdvisoryEntry(tenant_id=tid, **s)
                await _safe_insert(db.advisory_entries, e.model_dump())

        # Seasonal advisory
        if await db.seasonal_advisories.count_documents({"tenant_id": tid}) == 0:
            sa = SeasonalAdvisory(
                tenant_id=tid, title="Heavy Rainfall Alert",
                message="Heavy rainfall expected next 5 days. High risk of Rice Blast disease. Inspect fields every 3 days and apply preventive spray.",
                severity="high",
                crop_ids=[crop_id_map.get("Paddy")] if crop_id_map.get("Paddy") else [],
                states=["Telangana", "Andhra Pradesh"],
                is_published=True,
            )
            await _safe_insert(db.seasonal_advisories, sa.model_dump())


"""Seed default plans, demo tenant, demo users."""
import os
from datetime import datetime, timezone, timedelta
from models import Plan, Tenant, TenantTheme, TenantLabels, User, Product, PlatformSettings, now_iso, gen_id


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
            await db.plans.insert_one(plan.model_dump())

    # 2) Platform settings
    if await db.platform_settings.find_one({"id": "platform"}) is None:
        await db.platform_settings.insert_one(PlatformSettings().model_dump())

    # 3) Super admin user
    sa_phone = os.environ.get("SUPER_ADMIN_PHONE", "9858558555")
    existing_sa = await db.users.find_one({"phone": sa_phone, "role": "super_admin"})
    if not existing_sa:
        sa = User(phone=sa_phone, name="Super Admin", role="super_admin", tenant_id=None,
                  email="admin@localappstore.in")
        await db.users.insert_one(sa.model_dump())

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
        )
        await db.tenants.insert_one(tenant.model_dump())
        tenant_id = tenant.id

        # 5) Demo users for the demo tenant
        admin = User(tenant_id=tenant_id, phone="9000000001", name="Ravi Kumar",
                     role="tenant_admin", email="admin@akshara.demo")
        await db.users.insert_one(admin.model_dump())

        manager = User(tenant_id=tenant_id, phone="9000000002", name="Suresh Reddy",
                       role="manager", employee_code="MGR001", area="Telangana")
        await db.users.insert_one(manager.model_dump())

        employee = User(tenant_id=tenant_id, phone="9000000003", name="Anil Sharma",
                        role="employee", employee_code="EMP001",
                        manager_id=manager.id, area="Hyderabad North")
        await db.users.insert_one(employee.model_dump())

        employee2 = User(tenant_id=tenant_id, phone="9000000005", name="Priya Patel",
                         role="employee", employee_code="EMP002",
                         manager_id=manager.id, area="Hyderabad South")
        await db.users.insert_one(employee2.model_dump())

        customer = User(tenant_id=tenant_id, phone="9000000004", name="Ramesh Naidu",
                        role="customer", business_name="Naidu Krishi Kendra",
                        dealer_code="DLR001", village="Karimnagar",
                        district="Karimnagar", state="Telangana", pincode="505001",
                        assigned_employee_id=employee.id, credit_limit=50000,
                        outstanding_amount=12500)
        await db.users.insert_one(customer.model_dump())

        customer2 = User(tenant_id=tenant_id, phone="9000000006", name="Lakshmi Devi",
                         role="customer", business_name="Devi Agro Centre",
                         dealer_code="DLR002", village="Warangal",
                         district="Warangal", state="Telangana", pincode="506001",
                         assigned_employee_id=employee.id, credit_limit=30000,
                         outstanding_amount=5000)
        await db.users.insert_one(customer2.model_dump())

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
            await db.products.insert_one(prod.model_dump())

import { pgTable, serial, text, doublePrecision, timestamp, customType } from "drizzle-orm/pg-core";

const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry";
  },
});

const h3Index = customType<{ data: string; driverData: string }>({
  dataType() {
    return "h3index";
  },
});

export const pois = pgTable("pois", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  address: text("address"),
  geom: geometry("geom").notNull(),
  h3R9: h3Index("h3_r9"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courierRoutes = pgTable("courier_routes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  geom: geometry("geom").notNull(),
  distanceM: doublePrecision("distance_m"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

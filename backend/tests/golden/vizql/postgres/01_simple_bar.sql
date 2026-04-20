SELECT "t"."category" AS "category", SUM("t"."revenue") AS "rev" FROM "sales" "t" GROUP BY "t"."category" ORDER BY "rev" DESC LIMIT 100

SELECT COUNT(1) AS "cnt" FROM "sales" "t" INNER JOIN (SELECT "s"."id" AS "id" FROM "sales" "s" WHERE ("s"."order_date" >= '2026-01-01')) "ctx" ON ("t"."id" = "ctx"."id")

SELECT "t"."region" AS "region", SUM("t"."revenue") OVER (PARTITION BY "t"."region", "t"."segment") AS "inc" FROM "sales" "t"

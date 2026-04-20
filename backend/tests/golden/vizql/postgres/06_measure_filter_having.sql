SELECT "t"."region" AS "region", SUM("t"."qty") AS "qsum" FROM "sales" "t" GROUP BY "t"."region" HAVING (SUM("t"."qty") > 100)

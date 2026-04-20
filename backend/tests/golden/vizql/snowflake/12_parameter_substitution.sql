SELECT (SUM("t"."revenue") > 250000) AS "hit" FROM "sales" "t" GROUP BY "t"."region"

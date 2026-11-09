[out:json][timeout:60][bbox:55.68,37.48,55.82,37.78];
(
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian)(_link)?$"];
  way[natural=water];
  relation[natural=water];
  way[leisure=park];
  relation[leisure=park];
  way[landuse=forest];
  relation[landuse=forest];
);
out geom;
way[building~"^(apartments|residential|commercial|retail|office)$"];
out center;

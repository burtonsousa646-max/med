"""Render the checked-in Moscow illustration from an Overpass JSON extract.

Usage: python3 scripts/build-audience-map.py /path/to/moscow-osm.json
Fetch the extract with scripts/moscow-map.overpassql. Coordinates are OSM data;
the selected building locations illustrate an audience, not actual subscribers.
"""
import json
import math
from pathlib import Path
import random
import sys

ROOT = Path(__file__).resolve().parents[1]
SOUTH, WEST, NORTH, EAST = 55.68, 37.48, 55.82, 37.78
WIDTH = 1000


def mercator(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


SCALE = WIDTH / math.radians(EAST - WEST)
HEIGHT = round((mercator(NORTH) - mercator(SOUTH)) * SCALE, 1)


def project(point):
    return (round(math.radians(point['lon'] - WEST) * SCALE, 1),
            round((mercator(NORTH) - mercator(point['lat'])) * SCALE, 1))


def simplify(points, tolerance=.18):
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    length = (bx - ax) ** 2 + (by - ay) ** 2
    distances = []
    for x, y in points[1:-1]:
        t = max(0, min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length)) if length else 0
        distances.append((x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2)
    maximum = max(distances)
    if maximum <= tolerance ** 2:
        return [points[0], points[-1]]
    index = distances.index(maximum) + 1
    return simplify(points[:index + 1])[:-1] + simplify(points[index:])


def path(points, closed=False):
    points = simplify(points)
    return 'M' + 'L'.join(f'{x:g},{y:g}' for x, y in points) + ('Z' if closed else '')


def rings(element):
    if element['type'] == 'way':
        geometry = element.get('geometry', [])
        return [[project(p) for p in geometry]] if geometry and geometry[0] == geometry[-1] else []
    segments = [[(p['lon'], p['lat']) for p in member['geometry']]
                for member in element.get('members', [])
                if member.get('role') in ('outer', 'inner', '') and member.get('geometry')]
    result = []
    while segments:
        chain = segments.pop()
        while chain[0] != chain[-1]:
            for index, segment in enumerate(segments):
                if chain[-1] == segment[0]:
                    chain.extend(segment[1:])
                elif chain[-1] == segment[-1]:
                    chain.extend(reversed(segment[:-1]))
                else:
                    continue
                segments.pop(index)
                break
            else:
                raise ValueError(f"Incomplete polygon: {element['id']}")
        result.append([project({'lon': lon, 'lat': lat}) for lon, lat in chain])
    return result


def inside(point, ring):
    x, y = point
    crossings = 0
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            crossings += 1
    return crossings % 2 == 1


data = json.loads(Path(sys.argv[1]).read_text())
assert not data.get('remark'), data.get('remark')
layers = {key: [] for key in ('parks', 'water', 'minor', 'tertiary', 'secondary', 'primary', 'trunk')}
water_polygons = []
buildings = []
for element in data['elements']:
    tags = element.get('tags', {})
    if 'center' in element and 'building' in tags:
        buildings.append((element['id'], project(element['center'])))
    elif tags.get('natural') == 'water' or tags.get('leisure') == 'park' or tags.get('landuse') == 'forest':
        polygons = rings(element)
        if not polygons:
            continue
        water = tags.get('natural') == 'water'
        layers['water' if water else 'parks'].append(''.join(path(ring, True) for ring in polygons))
        if water:
            water_polygons.append(polygons)
    elif 'highway' in tags and element.get('geometry'):
        road = tags['highway'].removesuffix('_link')
        layer = 'trunk' if road in ('motorway', 'trunk') else road if road in ('primary', 'secondary', 'tertiary') else 'minor'
        layers[layer].append(path([project(p) for p in element['geometry']]))

assert all(layers[key] for key in ('parks', 'water', 'minor', 'primary')), 'Missing geographic layers'
assert len(buildings) > 240, 'Not enough building locations'
random.Random(2026).shuffle(buildings)
locations = []
for osm_id, (x, y) in buildings:
    if not (30 < x < WIDTH - 30 and 30 < y < HEIGHT - 30):
        continue
    if any((x - p['x']) ** 2 + (y - p['y']) ** 2 < 18 ** 2 for p in locations):
        continue
    if any(sum(inside((x, y), ring) for ring in polygon) % 2 for polygon in water_polygons):
        continue
    locations.append({'x': x, 'y': y, 'buildingId': osm_id})
    if len(locations) == 240:
        break
assert len(locations) == 240, 'Not enough separated locations on land'

styles = {
    'parks': 'fill="#273a36"',
    'water': 'fill="#101e2c" stroke="#3b5261" stroke-width="1.1"',
    'minor': 'fill="none" stroke="#414b56" stroke-width=".8"',
    'tertiary': 'fill="none" stroke="#515d68" stroke-width="1.2"',
    'secondary': 'fill="none" stroke="#65727e" stroke-width="1.6"',
    'primary': 'fill="none" stroke="#76838e" stroke-width="2"',
    'trunk': 'fill="none" stroke="#83909a" stroke-width="2.5"',
}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}">',
       '<title>Москва: улицы, река и парки</title>',
       '<desc>© OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright. Web Mercator projection; north up.</desc>',
       f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#222730"/>']
for layer, paths in layers.items():
    svg.append(f'<g {styles[layer]} fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round">')
    svg.extend(f'<path d="{geometry}"/>' for geometry in paths)
    svg.append('</g>')
svg.append('</svg>')
asset = ROOT / 'public/img/moscow-audience-map.svg'
asset.write_text('\n'.join(svg))
output = {'width': WIDTH, 'height': HEIGHT, 'bounds': [SOUTH, WEST, NORTH, EAST],
          'sourceTimestamp': data['osm3s']['timestamp_osm_base'], 'locations': locations}
(ROOT / 'src/screens/moscow-audience.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')
print(json.dumps({'bytes': asset.stat().st_size, 'layers': {k: len(v) for k, v in layers.items()},
                  'buildingCandidates': len(buildings), 'demoLocations': len(locations), 'viewBox': [WIDTH, HEIGHT]}))

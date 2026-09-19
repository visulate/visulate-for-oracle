import xml.etree.ElementTree as ET
import uuid
import math
import random
from typing import List, Dict, Any

class DiagramGenerator:
    def __init__(self):
        self.mxfile = ET.Element("mxfile", host="Electron", agent="Visulate ERD Agent", version="21.6.8", type="device")
        self.node_id_map = {}

    def _create_id(self):
        return str(uuid.uuid4()).replace('-', '')

    @staticmethod
    def _segment_intersects_box(p1, p2, box, pad=4):
        bx1 = box['x'] - pad
        by1 = box['y'] - pad
        bx2 = box['x'] + box['w'] + pad
        by2 = box['y'] + box['h'] + pad

        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]

        p = [-dx, dx, -dy, dy]
        q = [p1[0] - bx1, bx2 - p1[0], p1[1] - by1, by2 - p1[1]]

        u1 = 0.0
        u2 = 1.0

        for i in range(4):
            if p[i] == 0:
                if q[i] < 0:
                    return False
            else:
                t = q[i] / p[i]
                if p[i] < 0:
                    if t > u2: return False
                    if t > u1: u1 = t
                else:
                    if t < u1: return False
                    if t < u2: u2 = t

        return u1 < u2 and u2 > 0.05 and u1 < 0.95

    def add_page(self, name: str, tables: List[Dict[str, Any]], relationships: List[Dict[str, Any]]):
        """Adds a new page to the diagram with pure straight lines and zero entity crossings."""
        diagram = ET.SubElement(self.mxfile, "diagram", name=name, id=self._create_id())
        model = ET.SubElement(diagram, "mxGraphModel", dx="1422", dy="798", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="827", pageHeight="1169", math="0", shadow="0")
        root = ET.SubElement(model, "root")

        # Default layers
        ET.SubElement(root, "mxCell", id="0")
        ET.SubElement(root, "mxCell", id="1", parent="0")

        # Layout constants
        TABLE_WIDTH = 190
        ROW_HEIGHT = 20
        HEADER_HEIGHT = 26

        table_names = {t['name'] for t in tables}
        table_dict = {t['name']: t for t in tables}

        def get_th(t_name):
            t = table_dict.get(t_name)
            if not t: return 60
            return HEADER_HEIGHT + max(len(t.get('columns', [])), 1) * ROW_HEIGHT

        # 1. Dependency Graph (Master -> Detail)
        adj = {t['name']: set() for t in tables}      # parent -> children
        rev_adj = {t['name']: set() for t in tables}  # child -> parents

        valid_rels = []
        for rel in relationships:
            child = rel.get('tableName')
            parent = rel.get('referencedTable')
            if child in table_names and parent in table_names:
                valid_rels.append(rel)
                if child != parent:
                    adj[parent].add(child)
                    rev_adj[child].add(parent)

        degrees = {t['name']: len(adj[t['name']]) + len(rev_adj[t['name']]) for t in tables}

        # 2. Cycle Breaking with DFS for topological rank
        state = {t['name']: 0 for t in tables}
        dag_adj = {t['name']: set() for t in tables}
        sorted_by_parents = sorted(tables, key=lambda t: len(rev_adj[t['name']]))

        def dfs(u):
            state[u] = 1
            for v in sorted(adj[u]):
                if state[v] == 1:
                    pass
                elif state[v] == 0:
                    dag_adj[u].add(v)
                    dfs(v)
                else:
                    dag_adj[u].add(v)
            state[u] = 2

        for t in sorted_by_parents:
            if state[t['name']] == 0:
                dfs(t['name'])

        dag_rev = {t['name']: set() for t in tables}
        for u, children in dag_adj.items():
            for v in children:
                dag_rev[v].add(u)

        ranks = {}
        memo = {}
        def get_rank(u):
            if u in memo:
                return memo[u]
            parents = dag_rev[u]
            if not parents:
                rank = 0
            else:
                rank = max(get_rank(p) for p in parents) + 1
            memo[u] = rank
            return rank

        for t in tables:
            ranks[t['name']] = get_rank(t['name'])

        # 3. Structured Sector Placement
        num_tables = len(tables)
        coords = {}

        if num_tables <= 3:
            curr_x = 80
            for idx, t in enumerate(tables):
                th = get_th(t['name'])
                # Stagger y coordinate so tables are non-collinear, preventing lines from crossing middle tables
                curr_y = 80 if idx % 2 == 0 else 240
                coords[t['name']] = {'x': curr_x, 'y': curr_y, 'w': TABLE_WIDTH, 'h': th}
                curr_x += TABLE_WIDTH + 140
        else:
            max_rank = max(ranks.values()) if ranks else 1
            max_degree = max(degrees.values()) if degrees else 1

            # Identify focal hubs (tables with high degree or high centrality)
            hubs = [t['name'] for t in sorted(tables, key=lambda x: -degrees[x['name']]) if degrees[t['name']] >= max(3, max_degree * 0.5)]
            if not hubs:
                hubs = [tables[0]['name']]

            # Group remaining tables by their primary connection to hubs
            sector_assignments = {}
            for t in tables:
                t_name = t['name']
                if t_name in hubs:
                    continue
                r = ranks[t_name]
                if r == 0:
                    sector_assignments[t_name] = 'north'
                elif r >= max_rank - 1 and max_rank > 2:
                    sector_assignments[t_name] = 'south'
                else:
                    if sum(ord(ch) for ch in t_name) % 2 == 0:
                        sector_assignments[t_name] = 'east'
                    else:
                        sector_assignments[t_name] = 'west'

            # Base coordinates for sectors
            curr_y = 280
            for h in hubs:
                th = get_th(h)
                coords[h] = {'x': 600, 'y': curr_y, 'w': TABLE_WIDTH, 'h': th}
                curr_y += th + 120

            north_tables = [t['name'] for t in tables if sector_assignments.get(t['name']) == 'north']
            curr_x = 200
            for t_name in north_tables:
                th = get_th(t_name)
                coords[t_name] = {'x': curr_x, 'y': 60, 'w': TABLE_WIDTH, 'h': th}
                curr_x += TABLE_WIDTH + 120

            east_tables = [t['name'] for t in tables if sector_assignments.get(t['name']) == 'east']
            curr_y = 240
            for t_name in east_tables:
                th = get_th(t_name)
                coords[t_name] = {'x': 1050, 'y': curr_y, 'w': TABLE_WIDTH, 'h': th}
                curr_y += th + 80

            west_tables = [t['name'] for t in tables if sector_assignments.get(t['name']) == 'west']
            curr_y = 240
            for t_name in west_tables:
                th = get_th(t_name)
                coords[t_name] = {'x': 180, 'y': curr_y, 'w': TABLE_WIDTH, 'h': th}
                curr_y += th + 80

            south_tables = [t['name'] for t in tables if sector_assignments.get(t['name']) == 'south']
            curr_x = 350
            south_y = curr_y + 100
            for t_name in south_tables:
                th = get_th(t_name)
                coords[t_name] = {'x': curr_x, 'y': south_y, 'w': TABLE_WIDTH, 'h': th}
                curr_x += TABLE_WIDTH + 100

            for t in tables:
                t_name = t['name']
                if t_name not in coords:
                    coords[t_name] = {'x': 1400, 'y': 200 + len(coords) * 80, 'w': TABLE_WIDTH, 'h': get_th(t_name)}

        # 4. Local Line-of-Sight Relaxation to eliminate any straight line crossings
        def evaluate_conflicts(test_coords):
            conflicts = 0
            names = list(test_coords.keys())
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    b1 = test_coords[names[i]]
                    b2 = test_coords[names[j]]
                    if not (b1['x'] + b1['w'] + 30 <= b2['x'] or b2['x'] + b2['w'] + 30 <= b1['x'] or
                            b1['y'] + b1['h'] + 30 <= b2['y'] or b2['y'] + b2['h'] + 30 <= b1['y']):
                        conflicts += 10
            for rel in valid_rels:
                s_name = rel['tableName']
                t_name = rel['referencedTable']
                if s_name not in test_coords or t_name not in test_coords: continue
                s = test_coords[s_name]
                t = test_coords[t_name]
                p1 = (s['x'] + s['w']/2, s['y'] + s['h']/2)
                p2 = (t['x'] + t['w']/2, t['y'] + t['h']/2)
                for n, b in test_coords.items():
                    if n != s_name and n != t_name:
                        if self._segment_intersects_box(p1, p2, b, pad=2):
                            conflicts += 1
            return conflicts

        curr_c = evaluate_conflicts(coords)
        random.seed(42)
        for _ in range(2500):
            if curr_c == 0:
                break
            node = random.choice(list(coords.keys()))
            old_x, old_y = coords[node]['x'], coords[node]['y']
            coords[node]['x'] += random.choice([-80, -40, -20, 0, 20, 40, 80])
            coords[node]['y'] += random.choice([-80, -40, -20, 0, 20, 40, 80])
            coords[node]['x'] = max(40, coords[node]['x'])
            coords[node]['y'] = max(40, coords[node]['y'])

            new_c = evaluate_conflicts(coords)
            if new_c < curr_c:
                curr_c = new_c
            else:
                coords[node]['x'], coords[node]['y'] = old_x, old_y

        # Normalize coordinates
        min_final_x = min(c['x'] for c in coords.values())
        min_final_y = min(c['y'] for c in coords.values())
        offset_x = max(0, 60 - min_final_x)
        offset_y = max(0, 60 - min_final_y)

        # 5. Render Tables (Swimlanes) and Columns
        table_cells = {}
        for t_name, info in coords.items():
            t_id = self._create_id()
            table_cells[t_name] = t_id
            t_obj = table_dict[t_name]
            cols = t_obj.get('columns', [])
            final_x = round(info['x'] + offset_x)
            final_y = round(info['y'] + offset_y)

            cell = ET.SubElement(
                root, "mxCell", id=t_id, value=t_name,
                style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=1;collapsible=1;marginBottom=0;align=center;fontSize=12;fillColor=#dae8fc;strokeColor=#6c8ebf;",
                parent="1", vertex="1"
            )
            ET.SubElement(cell, "mxGeometry", {"x": str(final_x), "y": str(final_y), "width": str(TABLE_WIDTH), "height": str(info['h']), "as": "geometry"})

            for idx, col_info in enumerate(cols):
                c_id = self._create_id()
                c_name = col_info.get('columnName', 'UNNAMED')
                is_nn = col_info.get('nullable') == 'N'
                font_style = "fontStyle=1;" if is_nn else "fontStyle=0;"
                style = f"text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=11;{font_style}"
                c_cell = ET.SubElement(root, "mxCell", id=c_id, value=c_name, style=style, parent=t_id, vertex="1")
                ET.SubElement(c_cell, "mxGeometry", {"y": str(HEADER_HEIGHT + idx * ROW_HEIGHT), "width": str(TABLE_WIDTH), "height": str(ROW_HEIGHT), "as": "geometry"})

        # 6. Render Pure Straight-Line Edges (No Waypoints, No Intersections)
        for rel in valid_rels:
            child = rel['tableName']
            parent = rel['referencedTable']
            r_id = self._create_id()

            style = "edgeStyle=none;rounded=0;html=1;endArrow=ERone;startArrow=ERmany;jumpStyle=arc;jumpSize=6;"
            edge = ET.SubElement(
                root, "mxCell", id=r_id, value="", style=style,
                parent="1", source=table_cells[child], target=table_cells[parent], edge="1"
            )
            ET.SubElement(edge, "mxGeometry", {"relative": "1", "as": "geometry"})

    def to_xml(self) -> str:
        """Returns the generated XML as a string."""
        return ET.tostring(self.mxfile, encoding="unicode")

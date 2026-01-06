import xml.etree.ElementTree as ET
import uuid
from typing import List, Dict, Any

class DiagramGenerator:
    def __init__(self):
        self.mxfile = ET.Element("mxfile", host="Electron", agent="Visulate ERD Agent", version="21.6.8", type="device")
        self.node_id_map = {}

    def _create_id(self):
        return str(uuid.uuid4()).replace('-', '')

    def add_page(self, name: str, tables: List[Dict[str, Any]], relationships: List[Dict[str, Any]]):
        """Adds a new page to the diagram."""
        diagram = ET.SubElement(self.mxfile, "diagram", name=name, id=self._create_id())
        model = ET.SubElement(diagram, "mxGraphModel", dx="1422", dy="798", grid="1", gridSize="10", guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="1", pageScale="1", pageWidth="827", pageHeight="1169", math="0", shadow="0")
        root = ET.SubElement(model, "root")

        # Default layers
        ET.SubElement(root, "mxCell", id="0")
        ET.SubElement(root, "mxCell", id="1", parent="0")

        # Layout constants
        TABLE_WIDTH = 150
        ROW_HEIGHT = 20
        HEADER_HEIGHT = 26
        X_START = 50
        Y_START = 50
        X_GAP = 120 # Gap between columns
        Y_GAP = 100 # Minimum gap between rows

        # 1. Build relationship graph (Child -> Parents)
        adj = {t['name']: [] for t in tables}
        for rel in relationships:
            child = rel['tableName']
            parent = rel['referencedTable']
            if child in adj and parent in adj and parent != child:
                adj[child].append(parent)

        # 2. Calculate levels (Depth from root parents)
        levels = {}
        def get_level(t_name, stack):
            if t_name in levels: return levels[t_name]
            if t_name in stack: return 0 # Handle cycles
            stack.add(t_name)
            parents = adj.get(t_name, [])
            if not parents:
                levels[t_name] = 0
            else:
                levels[t_name] = max(get_level(p, stack) for p in parents) + 1
            stack.remove(t_name)
            return levels[t_name]

        for t in tables:
            get_level(t['name'], set())

        # Group tables by level
        tables_by_lvl = {}
        for t in tables:
            lvl = levels[t['name']]
            if lvl not in tables_by_lvl: tables_by_lvl[lvl] = []
            tables_by_lvl[lvl].append(t)

        # 3. Position and Render Tables
        table_cells = {}
        table_coords = {}
        current_y = Y_START

        for lvl in sorted(tables_by_lvl.keys()):
            lvl_tables = tables_by_lvl[lvl]
            current_x = X_START
            max_h_in_lvl = 0

            for table in lvl_tables:
                t_id = self._create_id()
                table_cells[table['name']] = t_id

                cols = table.get('columns', [])
                table_height = HEADER_HEIGHT + (len(cols) * ROW_HEIGHT)
                if table_height < 60: table_height = 60
                max_h_in_lvl = max(max_h_in_lvl, table_height)

                table_coords[table['name']] = (current_x, current_y, TABLE_WIDTH, table_height)

                # Create Table Cell (Swimlane)
                cell = ET.SubElement(root, "mxCell", id=t_id, value=table['name'], style="swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=1;collapsible=1;marginBottom=0;align=center;fontSize=12;fillColor=#dae8fc;strokeColor=#6c8ebf;", parent="1", vertex="1")
                ET.SubElement(cell, "mxGeometry", {"x": str(current_x), "y": str(current_y), "width": str(TABLE_WIDTH), "height": str(table_height), "as": "geometry"})

                # Add Columns
                for idx, col_info in enumerate(cols):
                    c_id = self._create_id()
                    col_name = col_info.get('columnName', 'UNNAMED')
                    is_nn = col_info.get('nullable') == 'N'

                    font_style = "fontStyle=1;" if is_nn else "fontStyle=0;"
                    style = f"text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=11;{font_style}"

                    c_cell = ET.SubElement(root, "mxCell", id=c_id, value=col_name, style=style, parent=t_id, vertex="1")
                    ET.SubElement(c_cell, "mxGeometry", {"y": str(HEADER_HEIGHT + idx * ROW_HEIGHT), "width": str(TABLE_WIDTH), "height": str(ROW_HEIGHT), "as": "geometry"})

                current_x += TABLE_WIDTH + X_GAP

            # Advance Y by the tallest table in this level plus minimum gap
            current_y += max_h_in_lvl + Y_GAP


        # 4. Add relationships
        # Filter: only render if both tables are on this page
        for rel in relationships:
            source = rel['tableName']
            target = rel['referencedTable']

            if source in table_cells and target in table_cells:
                r_id = self._create_id()
                # Using edgeStyle=orthogonalEdgeStyle with floating connectors for automatic re-routing and obstacle avoidance.
                style = (
                    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;"
                    "html=1;endArrow=ERone;startArrow=ERmany;"
                )
                edge = ET.SubElement(root, "mxCell", id=r_id, value="", style=style, parent="1", source=table_cells[source], target=table_cells[target], edge="1")
                ET.SubElement(edge, "mxGeometry", {"relative": "1", "as": "geometry"})

    def to_xml(self) -> str:
        """Returns the generated XML as a string."""
        return ET.tostring(self.mxfile, encoding="unicode")

import pytest
import xml.etree.ElementTree as ET
from erd_agent.diagram_generator import DiagramGenerator

@pytest.fixture
def sample_schema():
    tables = [
        {
            "name": "DEPARTMENTS",
            "columns": [
                {"columnName": "DEPARTMENT_ID", "nullable": "N", "dataType": "NUMBER"},
                {"columnName": "DEPARTMENT_NAME", "nullable": "N", "dataType": "VARCHAR2"},
                {"columnName": "MANAGER_ID", "nullable": "Y", "dataType": "NUMBER"},
                {"columnName": "LOCATION_ID", "nullable": "Y", "dataType": "NUMBER"}
            ]
        },
        {
            "name": "EMPLOYEES",
            "columns": [
                {"columnName": "EMPLOYEE_ID", "nullable": "N", "dataType": "NUMBER"},
                {"columnName": "FIRST_NAME", "nullable": "Y", "dataType": "VARCHAR2"},
                {"columnName": "LAST_NAME", "nullable": "N", "dataType": "VARCHAR2"},
                {"columnName": "DEPARTMENT_ID", "nullable": "Y", "dataType": "NUMBER"},
                {"columnName": "MANAGER_ID", "nullable": "Y", "dataType": "NUMBER"}
            ]
        },
        {
            "name": "LOCATIONS",
            "columns": [
                {"columnName": "LOCATION_ID", "nullable": "N", "dataType": "NUMBER"},
                {"columnName": "CITY", "nullable": "N", "dataType": "VARCHAR2"}
            ]
        },
        {
            "name": "STANDALONE",
            "columns": [
                {"columnName": "ID", "nullable": "N", "dataType": "NUMBER"}
            ]
        }
    ]

    relationships = [
        {"tableName": "EMPLOYEES", "referencedTable": "DEPARTMENTS", "constraintName": "EMP_DEPT_FK"},
        {"tableName": "DEPARTMENTS", "referencedTable": "LOCATIONS", "constraintName": "DEPT_LOC_FK"},
        # Circular relationship
        {"tableName": "DEPARTMENTS", "referencedTable": "EMPLOYEES", "constraintName": "DEPT_MGR_FK"},
        # Self-referential relationship
        {"tableName": "EMPLOYEES", "referencedTable": "EMPLOYEES", "constraintName": "EMP_MGR_FK"}
    ]

    return tables, relationships

def test_diagram_generator_xml_structure(sample_schema):
    tables, relationships = sample_schema
    gen = DiagramGenerator()
    gen.add_page("HR Schema", tables, relationships)
    xml_str = gen.to_xml()

    root = ET.fromstring(xml_str)
    assert root.tag == "mxfile"
    diagram = root.find("diagram")
    assert diagram is not None
    assert diagram.get("name") == "HR Schema"

    model = diagram.find("mxGraphModel")
    assert model is not None
    cell_root = model.find("root")
    assert cell_root is not None

def test_diagram_generator_straight_lines(sample_schema):
    tables, relationships = sample_schema
    gen = DiagramGenerator()
    gen.add_page("HR Schema", tables, relationships)
    xml_str = gen.to_xml()

    root = ET.fromstring(xml_str)
    edges = [cell for cell in root.iter("mxCell") if cell.get("edge") == "1"]
    
    # Check that valid relationships were created
    assert len(edges) >= 2
    for edge in edges:
        style = edge.get("style", "")
        # Straight lines (edgeStyle=none) with line jumps
        assert "edgeStyle=none" in style
        assert "jumpStyle=arc" in style
        # No waypoints added (pure straight segment)
        geom = edge.find("mxGeometry")
        assert geom is not None
        assert geom.find("Array") is None

def test_diagram_generator_zero_collisions(sample_schema):
    tables, relationships = sample_schema
    gen = DiagramGenerator()
    gen.add_page("HR Schema", tables, relationships)
    xml_str = gen.to_xml()

    root = ET.fromstring(xml_str)
    table_boxes = {}
    for cell in root.iter("mxCell"):
        if cell.get("vertex") == "1" and cell.get("parent") == "1":
            geom = cell.find("mxGeometry")
            table_boxes[cell.get("id")] = {
                "x": float(geom.get("x")),
                "y": float(geom.get("y")),
                "w": float(geom.get("width")),
                "h": float(geom.get("height"))
            }

    for edge in root.iter("mxCell"):
        if edge.get("edge") == "1":
            src_id = edge.get("source")
            tgt_id = edge.get("target")
            src = table_boxes[src_id]
            tgt = table_boxes[tgt_id]
            p1 = (src["x"] + src["w"] / 2, src["y"] + src["h"] / 2)
            p2 = (tgt["x"] + tgt["w"] / 2, tgt["y"] + tgt["h"] / 2)

            for tid, box in table_boxes.items():
                if tid != src_id and tid != tgt_id:
                    assert not DiagramGenerator._segment_intersects_box(p1, p2, box, pad=0)

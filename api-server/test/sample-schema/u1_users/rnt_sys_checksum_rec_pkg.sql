CREATE OR REPLACE PACKAGE        RNT_SYS_CHECKSUM_REC_PKG AS
/******************************************************************************
   NAME:       RNT_SYS_CHECKSUM_REC_PKG
   PURPOSE: Calculate checksum for record.

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        28.03.2007             1. Created this package.
******************************************************************************/

/* Raise when length of internal value > 32760.
If it meaning then you can use next code:
  rnt_sys_checksum_rec_pkg.init;
  rnt_sys_checksum_rec_pkg.append(<very long string about 32000>);
  x1 := rnt_sys_checksum_rec_pkg.get_checksum();

  rnt_sys_checksum_rec_pkg.init;
  rnt_sys_checksum_rec_pkg.append(<another very long string about 32000>);
  x2 := rnt_sys_checksum_rec_pkg.get_checksum();

  rnt_sys_checksum_rec_pkg.init;
  rnt_sys_checksum_rec_pkg.append(x1);
  rnt_sys_checksum_rec_pkg.append(x2);

  dbms_output.put_line(rnt_sys_checksum_rec_pkg.get_checksum());
*/
E_BOUNDARY_ERROR EXCEPTION;

PRAGMA EXCEPTION_INIT (E_BOUNDARY_ERROR, -20001);

-- inital package state
procedure init;

-- append field value to checksum
procedure append(p_char VARCHAR2);
procedure append(p_number NUMBER);
procedure append(p_date DATE);


-- return internal value. Length of return value 32 bytes.
function get_internal_value return varchar2;

-- set internal value
procedure set_internal_value(val varchar2);

-- return checksum
function get_checksum return varchar2;

function get_checksum(x_columns_value in varchar2) return varchar2;

END RNT_SYS_CHECKSUM_REC_PKG;
/


CREATE OR REPLACE PACKAGE BODY        RNT_SYS_CHECKSUM_REC_PKG AS
/******************************************************************************
   NAME:       RNT_SYS_CHECKSUM_REC_PKG
   PURPOSE:

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        28.03.2007             1. Created this package body.
******************************************************************************/

g_columns_value VARCHAR2(32760);
g_boundary  CONSTANT VARCHAR2(20):= 'aguk@lan.aommz.com';

procedure init
is
begin
    g_columns_value := '';
end;

procedure append(p_char varchar2)
is
begin
   -- append field separator, if first field value was adding
   if g_columns_value is not null then
      if  length(g_columns_value) + length(g_boundary) > 32760 then
         raise E_BOUNDARY_ERROR;
      end if;
      g_columns_value := g_columns_value||g_boundary;
   end if;

   if length(g_columns_value) + length(p_char) > 32760 then
      raise E_BOUNDARY_ERROR;
   end if;

   g_columns_value := g_columns_value||p_char;
end;

procedure append(p_number NUMBER)
is
begin
  append(to_char(p_number));
end;

procedure append(p_date DATE)
is
begin
  append('RRRRMMDDHH24MISS');
end;


function get_checksum return varchar2
is
  x_field varchar2(32760) := '';
  x_key_string varchar2(16) := 'VISULATE-RENTAL_';
begin
  return RAWTOHEX(UTL_RAW.CAST_TO_RAW(dbms_obfuscation_toolkit.MD5(input_string => g_columns_value)));
end;

-- return internal value.
function get_internal_value return varchar2
is
begin
  return g_columns_value;
end;

-- set internal value
procedure set_internal_value(val varchar2)
is
begin
  g_columns_value := val;
end;

function get_checksum(x_columns_value in varchar2) return varchar2 is
begin
  init;
  append(x_columns_value);
  return get_checksum;
end  get_checksum;


END RNT_SYS_CHECKSUM_REC_PKG;
/

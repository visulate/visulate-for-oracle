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

END RNT_SYS_CHECKSUM_REC_PKG;
/



CREATE OR REPLACE PACKAGE        RNT_USERS_PKG AS
/******************************************************************************
   NAME:       RNT_USERS_PKG
   PURPOSE:

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        12.04.2007             1. Created this package.
   for password 'Admin' md5 = e3afed0047b08059d0fada10f400c1e5
******************************************************************************/

function LOGIN(X_LOGIN RNT_USERS.USER_LOGIN%TYPE, 
               X_PASSWORD RNT_USERS.USER_PASSWORD%TYPE)
               return RNT_USERS.USER_ID%TYPE;

procedure SET_USER(X_USER_ID NUMBER);

procedure SET_ROLE(X_ROLE_CODE VARCHAR2);

function GET_USER return NUMBER;

function GET_ROLE return VARCHAR2;

function CHANGE_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE) return varchar2;

procedure CHANGE_ACTIVE_FLAG(X_USER_ID RNT_USERS.USER_ID%TYPE);

END RNT_USERS_PKG;
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
 

END RNT_SYS_CHECKSUM_REC_PKG;
/



CREATE OR REPLACE PACKAGE BODY        RNT_USERS_PKG AS
/******************************************************************************
   NAME:       RNT_USERS_PKG
   PURPOSE:

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        12.04.2007             1. Created this package body.
******************************************************************************/

-- current user
G_USER_ID NUMBER;
G_ROLE_CODE VARCHAR2(30);
--G_IS_ADMIN VARCHAR2(1);

function is_user_role(X_USER_ID RNT_USERS.USER_ID%TYPE, 
                      X_ROLE_CODE RNT_USER_ROLES.ROLE_CODE%TYPE) return boolean
is
  x NUMBER;
begin
  select 1
  into x
  from DUAL 
  where exists (
                  select 1
                  from  RNT_USER_ASSIGNMENTS_V
                  where USER_ID = X_USER_ID
                    and ROLE_CODE = X_ROLE_CODE 
               );
  return TRUE;
exception  
  when NO_DATA_FOUND then
    return FALSE;  
end;

function LOGIN(X_LOGIN RNT_USERS.USER_LOGIN%TYPE, 
               X_PASSWORD RNT_USERS.USER_PASSWORD%TYPE)
           return RNT_USERS.USER_ID%TYPE
is
  x RNT_USERS.USER_ID%TYPE;
begin
  x := -1;
  select USER_ID
  into x
  from RNT_USERS
  where USER_LOGIN = X_LOGIN
    and USER_PASSWORD = X_PASSWORD
    and IS_ACTIVE_YN = 'Y';
  return x;  
exception
  when NO_DATA_FOUND or TOO_MANY_ROWS then
     return -1;
  when OTHERS then
     return -1;     
end;

procedure set_user(X_USER_ID NUMBER)
is
  x NUMBER;
begin
  select USER_ID --, IS_ADMIN_YN
  into g_user_id --, g_is_admin
  from RNT_USERS
  where USER_ID = X_USER_ID;
end;

procedure set_role(X_ROLE_CODE VARCHAR2)
is
begin
  select ROLE_CODE
  into g_role_code
  from RNT_USER_ASSIGNMENTS_V
  where USER_ID = G_USER_ID
    and ROLE_CODE = X_ROLE_CODE
  group by ROLE_CODE ;  
end;

function GET_USER return NUMBER
is
begin
  return G_USER_ID;
end;

function GET_ROLE return VARCHAR2
is
begin
  return G_ROLE_CODE;
end;

function CHANGE_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE) return VARCHAR2
is
begin
   update RNT_USERS
   set USER_PASSWORD = X_NEW_PASSWORD
   where USER_ID = X_USER_ID;
   if SQL%ROWCOUNT = 1 then
      return 'Y';
   end if;
   return 'N';   
end;

procedure change_active_flag(X_USER_ID RNT_USERS.USER_ID%TYPE)
is
  x VARCHAR2(1);
begin
  select IS_ACTIVE_YN
  into x
  from RNT_USERS
  where USER_ID = X_USER_ID;
  
  if x = 'N' then
     x := 'Y';
  else
     x := 'N';
  end if;
  
  update RNT_USERS
  set IS_ACTIVE_YN = x
  where USER_ID = X_USER_ID;    

end;

/*
function IS_ADMIN return VARCHAR2
is
begin
  return g_is_admin;
end;
*/
BEGIN
 G_USER_ID := -1;
 G_ROLE_CODE := '';
-- G_IS_ADMIN := 'N';
END RNT_USERS_PKG;
/



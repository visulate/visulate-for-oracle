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

function CHANGE_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, 
                         X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE,
                         X_OLD_PASSWORD RNT_USERS.USER_PASSWORD%TYPE) return VARCHAR2;

procedure SET_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, 
                       X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE);
                       
procedure CHANGE_ACTIVE_FLAG(X_USER_ID RNT_USERS.USER_ID%TYPE);

function get_checksum(X_USER_ID RNT_USERS.USER_ID%TYPE) return varchar2;

procedure UPDATE_ROW(X_USER_ID          RNT_USERS.USER_ID%TYPE,
                     X_USER_LOGIN       RNT_USERS.USER_LOGIN%TYPE,
                     X_USER_NAME        RNT_USERS.USER_NAME%TYPE,
                     X_IS_ACTIVE_YN     RNT_USERS.IS_ACTIVE_YN%TYPE,
                     X_USER_LASTNAME    RNT_USERS.USER_LASTNAME%TYPE,
                     X_PRIMARY_PHONE    RNT_USERS.PRIMARY_PHONE%TYPE,
                     X_SECONDARY_PHONE  RNT_USERS.SECONDARY_PHONE%TYPE,
                     X_IS_SUBSCRIBED_YN RNT_USERS.IS_SUBSCRIBED_YN%TYPE,
                     X_CHECKSUM VARCHAR2
                     );

function INSERT_ROW(X_USER_LOGIN        IN RNT_USERS.USER_LOGIN%TYPE,
                    X_USER_NAME         IN RNT_USERS.USER_NAME%TYPE,
                    X_USER_PASSWORD     IN RNT_USERS.USER_PASSWORD%TYPE, 
                    X_IS_ACTIVE_YN      IN RNT_USERS.IS_ACTIVE_YN%TYPE,
                    X_USER_LASTNAME     IN RNT_USERS.USER_LASTNAME%TYPE,
                    X_PRIMARY_PHONE     IN RNT_USERS.PRIMARY_PHONE%TYPE,
                    X_SECONDARY_PHONE   IN RNT_USERS.SECONDARY_PHONE%TYPE,
                    X_IS_SUBSCRIBED_YN  IN RNT_USERS.IS_SUBSCRIBED_YN%TYPE,
                    X_AGREEMENT_DATE    IN RNT_USERS.AGREEMENT_DATE%TYPE := NULL       

                   ) return RNT_USERS.USER_ID%TYPE; 

function ENCRYPT_PASSWORD(INPUT_STRING varchar2) return varchar2;  

procedure UPDATE_USER_DATA(X_USER_ID         RNT_USERS.USER_ID%TYPE,
                           X_USER_NAME       RNT_USERS.USER_NAME%TYPE,
                           X_USER_LASTNAME   RNT_USERS.USER_LASTNAME%TYPE,
                           X_PRIMARY_PHONE   RNT_USERS.PRIMARY_PHONE%TYPE,
                           X_SECONDARY_PHONE RNT_USERS.SECONDARY_PHONE%TYPE
                         );
                          
END RNT_USERS_PKG;
/

SHOW ERRORS;

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

X_MANAGER_ROLE_ID        CONSTANT number := 1;
X_OWNER_ROLE_ID          CONSTANT number := 2;
X_ADMIN_ROLE_ID          CONSTANT number := 3;
X_MANAGER_OWNER_ROLE_ID  CONSTANT number := 4;
X_BUSINESS_OWNER_ROLE_ID CONSTANT NUMBER := 5;
X_BOOKKEEPING_ROLE_ID    CONSTANT NUMBER := 6;
X_ADVERTISE_ROLE_ID      CONSTANT number := 7;
X_BUYER_ROLE_ID          CONSTANT number := 8;

X_ADMIN_USERID           constant number := 1;
X_ADMIN_EMAIL            constant varchar(60) := 'admin@null.com';

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
  where UPPER(USER_LOGIN) = UPPER(X_LOGIN)
    and USER_PASSWORD = RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(X_PASSWORD)
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

function CHANGE_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, 
                         X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE,
                         X_OLD_PASSWORD RNT_USERS.USER_PASSWORD%TYPE) return VARCHAR2
is
  x NUMBER;
begin
  begin
   select 1
   into x 
   from RNT_USERS
   where USER_ID = X_USER_ID
     and USER_PASSWORD = RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(X_OLD_PASSWORD);
  exception
    when NO_DATA_FOUND then
       RAISE_APPLICATION_ERROR(-20520, 'Cannot change password. Old password is a not valid.');   
  end; 
  
  update RNT_USERS
  set USER_PASSWORD = RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(X_NEW_PASSWORD)
  where USER_ID = X_USER_ID;
  if SQL%ROWCOUNT = 1 then
     return 'Y';
  end if;
  return 'N';   
end;

procedure SET_PASSWORD(X_USER_ID RNT_USERS.USER_ID%TYPE, 
                       X_NEW_PASSWORD RNT_USERS.USER_PASSWORD%TYPE) 
is
begin
  update RNT_USERS
  set USER_PASSWORD = RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(X_NEW_PASSWORD)
  where USER_ID = X_USER_ID;
  if SQL%ROWCOUNT = 1 then
     NULL;
  else
     RAISE_APPLICATION_ERROR(-20521, 'Password not changed');     
  end if;
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

function get_checksum(X_USER_ID RNT_USERS.USER_ID%TYPE) return varchar2
is
begin
  for x in (select USER_ID, USER_LOGIN, USER_NAME, USER_PASSWORD, IS_ACTIVE_YN
            from RNT_USERS 
            where USER_ID = X_USER_ID) 
 loop
     RNT_SYS_CHECKSUM_REC_PKG.INIT;
     RNT_SYS_CHECKSUM_REC_PKG.APPEND(x.USER_ID);         
     RNT_SYS_CHECKSUM_REC_PKG.APPEND(x.USER_LOGIN);
     RNT_SYS_CHECKSUM_REC_PKG.APPEND(x.USER_NAME); 
     RNT_SYS_CHECKSUM_REC_PKG.APPEND(x.IS_ACTIVE_YN);
     return RNT_SYS_CHECKSUM_REC_PKG.GET_CHECKSUM;
 end loop;           
end;

function check_unique(X_USER_ID RNT_USERS.USER_ID%TYPE,
                      X_USER_LOGIN RNT_USERS.USER_LOGIN%TYPE
                      ) return boolean
is
  x NUMBER;
begin
   select 1 
   into x
   from DUAL
   where exists (
                   select 1
                   from RNT_USERS
                   where UPPER(USER_LOGIN) = UPPER(X_USER_LOGIN)
                     and (USER_ID != X_USER_ID or X_USER_ID is null)
                 );
  return false;
exception
  when NO_DATA_FOUND then
     return true;                        
end;                       
                      

procedure lock_row(X_USER_ID RNT_USERS.USER_ID%TYPE)
is
    cursor c is
             select USER_ID, USER_LOGIN, USER_NAME, 
                    USER_PASSWORD, IS_ACTIVE_YN
             from RNT_USERS
             where USER_ID = X_USER_ID
             for update of USER_ID nowait; 
begin
  open c;
  close c;
exception
  when OTHERS then
    if SQLCODE = -54 then
      RAISE_APPLICATION_ERROR(-20001, 'Cannot changed record. Record is locked.');
    end if; 
end;


procedure UPDATE_ROW(X_USER_ID RNT_USERS.USER_ID%TYPE,
                     X_USER_LOGIN RNT_USERS.USER_LOGIN%TYPE,
                     X_USER_NAME RNT_USERS.USER_NAME%TYPE,
                     X_IS_ACTIVE_YN RNT_USERS.IS_ACTIVE_YN%TYPE,
                     X_USER_LASTNAME RNT_USERS.USER_LASTNAME%TYPE,
                     X_PRIMARY_PHONE RNT_USERS.PRIMARY_PHONE%TYPE,
                     X_SECONDARY_PHONE RNT_USERS.SECONDARY_PHONE%TYPE,
                     X_IS_SUBSCRIBED_YN RNT_USERS.IS_SUBSCRIBED_YN%TYPE,
                     X_CHECKSUM VARCHAR2
                     )
is
l_checksum varchar2(32); 
begin
   
   lock_row(X_USER_ID);
   
   -- validate checksum   
   l_checksum := get_checksum(X_USER_ID);
   if X_CHECKSUM != l_checksum then
      RAISE_APPLICATION_ERROR(-20002, 'Record was changed another user.');
   end if;

   if not check_unique(X_USER_ID, X_USER_LOGIN) then
        RAISE_APPLICATION_ERROR(-20522, 'User login must be unique');                      
   end if;   
   
   update RNT_USERS
   set USER_LOGIN    = X_USER_LOGIN,
       USER_NAME     = X_USER_NAME,
       IS_ACTIVE_YN  = X_IS_ACTIVE_YN,
       USER_LASTNAME = X_USER_LASTNAME,
       PRIMARY_PHONE  = X_PRIMARY_PHONE,
       SECONDARY_PHONE = X_SECONDARY_PHONE,
       IS_SUBSCRIBED_YN = X_IS_SUBSCRIBED_YN
   where USER_ID     = X_USER_ID;
end;
       
function INSERT_ROW(X_USER_LOGIN       IN RNT_USERS.USER_LOGIN%TYPE,
                    X_USER_NAME        IN RNT_USERS.USER_NAME%TYPE,
                    X_USER_PASSWORD    IN RNT_USERS.USER_PASSWORD%TYPE, 
                    X_IS_ACTIVE_YN     IN RNT_USERS.IS_ACTIVE_YN%TYPE,
                    X_USER_LASTNAME    IN RNT_USERS.USER_LASTNAME%TYPE,
                    X_PRIMARY_PHONE    IN RNT_USERS.PRIMARY_PHONE%TYPE,
                    X_SECONDARY_PHONE  IN RNT_USERS.SECONDARY_PHONE%TYPE,
                    X_IS_SUBSCRIBED_YN IN RNT_USERS.IS_SUBSCRIBED_YN%TYPE,
                    X_AGREEMENT_DATE   IN RNT_USERS.AGREEMENT_DATE%TYPE          
                   ) return RNT_USERS.USER_ID%TYPE
is
   x RNT_USERS.USER_ID%TYPE;
begin
   if not check_unique(NULL, X_USER_LOGIN) then
        RAISE_APPLICATION_ERROR(-20522, 'User login must be unique');                      
   end if;   
   insert into RNT_USERS (USER_ID, USER_LOGIN, USER_NAME, 
                          USER_PASSWORD, IS_ACTIVE_YN, 
                          USER_LASTNAME, PRIMARY_PHONE,
                          SECONDARY_PHONE, IS_SUBSCRIBED_YN, AGREEMENT_DATE) 
   values (RNT_USERS_SEQ.NEXTVAL, X_USER_LOGIN, X_USER_NAME, 
           RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(X_USER_PASSWORD), X_IS_ACTIVE_YN,
           X_USER_LASTNAME, X_PRIMARY_PHONE,
           X_SECONDARY_PHONE, X_IS_SUBSCRIBED_YN, X_AGREEMENT_DATE)
   returning USER_ID into x;
   return x;
end;
 


function ENCRYPT_PASSWORD(INPUT_STRING varchar2) return varchar2
is
begin
  return RNT_OBFURCATION_PASSWORD_PKG.ENCRYPT(INPUT_STRING);
end;


procedure UPDATE_USER_DATA(X_USER_ID RNT_USERS.USER_ID%TYPE,
                           X_USER_NAME RNT_USERS.USER_NAME%TYPE,
                           X_USER_LASTNAME RNT_USERS.USER_LASTNAME%TYPE,
                           X_PRIMARY_PHONE RNT_USERS.PRIMARY_PHONE%TYPE,
                           X_SECONDARY_PHONE RNT_USERS.SECONDARY_PHONE%TYPE
                         )
is
begin
   update RNT_USERS
   set USER_NAME     = X_USER_NAME,
       USER_LASTNAME = X_USER_LASTNAME,
       PRIMARY_PHONE  = X_PRIMARY_PHONE,
       SECONDARY_PHONE = X_SECONDARY_PHONE
   where USER_ID     = X_USER_ID;
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

SHOW ERRORS;

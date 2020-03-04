create or replace package RNT_MENU_ROLES_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_ROLES_PKG
    Purpose:   API's for RNT_MENU_ROLES table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version
*******************************************************************************/
  function get_checksum( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                       , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE)
            return RNT_MENU_ROLES_V.CHECKSUM%TYPE;

  procedure update_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                      , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE
                      , X_CHECKSUM IN RNT_MENU_ROLES_V.CHECKSUM%TYPE);

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                     , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE);

  procedure delete_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                       , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE);

end RNT_MENU_ROLES_PKG;
/
create or replace package body RNT_MENU_ROLES_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_ROLES_PKG
    Purpose:   API's for RNT_MENU_ROLES table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version

********************************************************************************/
-------------------------------------------------
--  Private Procedures and Functions
-------------------------------------------------


  procedure lock_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                    , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE) is
     cursor c is
     select * from RNT_MENU_ROLES
     where TAB_NAME = X_TAB_NAME
    and ROLE_ID = X_ROLE_ID
     for update nowait;

  begin
    open c;
    close c;
  exception
    when OTHERS then
      if SQLCODE = -54 then
        RAISE_APPLICATION_ERROR(-20001, 'Cannot changed record. Record is locked.');
      end if;
  end lock_row;

-------------------------------------------------
--  Public Procedures and Functions
-------------------------------------------------
  function get_checksum( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                       , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE)
            return RNT_MENU_ROLES_V.CHECKSUM%TYPE is

    v_return_value               RNT_MENU_ROLES_V.CHECKSUM%TYPE;
  begin
    select CHECKSUM
    into v_return_value
    from RNT_MENU_ROLES_V
    where TAB_NAME = X_TAB_NAME
    and ROLE_ID = X_ROLE_ID;
    return v_return_value;
  end get_checksum;

  procedure update_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                      , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE
                      , X_CHECKSUM IN RNT_MENU_ROLES_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENU_ROLES_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME, X_ROLE_ID);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME, X_ROLE_ID);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENU_ROLES
     set ROLE_ID = X_ROLE_ID
     where TAB_NAME = X_TAB_NAME;

  end update_row;

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                     , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENU_ROLES
     ( TAB_NAME
     , ROLE_ID)
     values
     ( X_TAB_NAME
     , X_ROLE_ID);

  end insert_row;

  procedure delete_row( X_TAB_NAME IN RNT_MENU_ROLES.TAB_NAME%TYPE
                       , X_ROLE_ID IN RNT_MENU_ROLES.ROLE_ID%TYPE) is

  begin
    delete from RNT_MENU_ROLES
    where TAB_NAME = X_TAB_NAME
    and ROLE_ID = X_ROLE_ID;

  end delete_row;

end RNT_MENU_ROLES_PKG;
/
show errors package rnt_menu_roles_pkg
show errors package body rnt_menu_roles_pkg

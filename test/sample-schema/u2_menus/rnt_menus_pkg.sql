create or replace package RNT_MENUS_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENUS_PKG
    Purpose:   API's for RNT_MENUS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version
*******************************************************************************/
  function get_checksum( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE)
            return RNT_MENUS_V.CHECKSUM%TYPE;

  procedure update_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE
                      , X_MENU_TITLE IN RNT_MENUS.MENU_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENUS.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM IN RNT_MENUS_V.CHECKSUM%TYPE);

  procedure  insert_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE
                     , X_MENU_TITLE IN RNT_MENUS.MENU_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENUS.DISPLAY_SEQ%TYPE);

  procedure delete_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE);

end RNT_MENUS_PKG;
/
create or replace package body RNT_MENUS_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENUS_PKG
    Purpose:   API's for RNT_MENUS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version

********************************************************************************/
-------------------------------------------------
--  Private Procedures and Functions
-------------------------------------------------


  procedure lock_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE) is
     cursor c is
     select * from RNT_MENUS
     where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
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
  function get_checksum( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE)
            return RNT_MENUS_V.CHECKSUM%TYPE is

    v_return_value               RNT_MENUS_V.CHECKSUM%TYPE;
  begin
    select CHECKSUM
    into v_return_value
    from RNT_MENUS_V
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME;
    return v_return_value;
  end get_checksum;

  procedure update_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE
                      , X_MENU_TITLE IN RNT_MENUS.MENU_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENUS.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM IN RNT_MENUS_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENUS_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME, X_MENU_NAME);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME, X_MENU_NAME);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENUS
     set MENU_NAME = X_MENU_NAME
     , MENU_TITLE = X_MENU_TITLE
     , DISPLAY_SEQ = X_DISPLAY_SEQ
     where TAB_NAME  = X_TAB_NAME
     and   MENU_NAME = X_MENU_NAME;

  end update_row;

  procedure  insert_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE
                     , X_MENU_TITLE IN RNT_MENUS.MENU_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENUS.DISPLAY_SEQ%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENUS
     ( TAB_NAME
     , PARENT_TAB
     , MENU_NAME
     , MENU_TITLE
     , DISPLAY_SEQ)
     values
     ( X_TAB_NAME
     , 'public'
     , X_MENU_NAME
     , X_MENU_TITLE
     , X_DISPLAY_SEQ);

  end insert_row;

  procedure delete_row( X_TAB_NAME IN RNT_MENUS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENUS.MENU_NAME%TYPE) is

  begin
    delete from RNT_MENUS
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME;

  end delete_row;

end RNT_MENUS_PKG;
/

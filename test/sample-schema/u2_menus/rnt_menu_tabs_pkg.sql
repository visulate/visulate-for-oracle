create or replace package RNT_MENU_TABS_PKG as
/*******************************************************************************

   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_TABS_PKG
    Purpose:   API's for RNT_MENU_TABS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        01-FEB-10   Auto Generated   Initial Version
*******************************************************************************/

  function get_checksum( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE)
            return RNT_MENU_TABS_V.CHECKSUM%TYPE;

  procedure update_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE
                      , X_TAB_TITLE IN RNT_MENU_TABS.TAB_TITLE%TYPE
                      , X_PARENT_TAB IN RNT_MENU_TABS.PARENT_TAB%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_TABS.DISPLAY_SEQ%TYPE
                      , X_TAB_HREF IN RNT_MENU_TABS.TAB_HREF%TYPE
                      , X_CHECKSUM IN RNT_MENU_TABS_V.CHECKSUM%TYPE);

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE
                     , X_TAB_TITLE IN RNT_MENU_TABS.TAB_TITLE%TYPE
                     , X_PARENT_TAB IN RNT_MENU_TABS.PARENT_TAB%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_TABS.DISPLAY_SEQ%TYPE
                     , X_TAB_HREF IN RNT_MENU_TABS.TAB_HREF%TYPE);

  procedure delete_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE);

end RNT_MENU_TABS_PKG;
/
create or replace package body RNT_MENU_TABS_PKG as
/*******************************************************************************

   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_TABS_PKG
    Purpose:   API's for RNT_MENU_TABS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        01-FEB-10   Auto Generated   Initial Version

********************************************************************************/
-------------------------------------------------
--  Private Procedures and Functions
-------------------------------------------------


  procedure lock_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE) is
     cursor c is
     select * from RNT_MENU_TABS
     where TAB_NAME = X_TAB_NAME
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
  function get_checksum( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE)
            return RNT_MENU_TABS_V.CHECKSUM%TYPE is

    v_return_value               RNT_MENU_TABS_V.CHECKSUM%TYPE;
  begin
    select CHECKSUM
    into v_return_value
    from RNT_MENU_TABS_V
    where TAB_NAME = X_TAB_NAME;
    return v_return_value;
  end get_checksum;

  procedure update_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE
                      , X_TAB_TITLE IN RNT_MENU_TABS.TAB_TITLE%TYPE
                      , X_PARENT_TAB IN RNT_MENU_TABS.PARENT_TAB%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_TABS.DISPLAY_SEQ%TYPE
                      , X_TAB_HREF IN RNT_MENU_TABS.TAB_HREF%TYPE
                      , X_CHECKSUM IN RNT_MENU_TABS_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENU_TABS_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENU_TABS
     set TAB_TITLE = X_TAB_TITLE
     , PARENT_TAB = X_PARENT_TAB
     , DISPLAY_SEQ = X_DISPLAY_SEQ
     , TAB_HREF = X_TAB_HREF
     where TAB_NAME = X_TAB_NAME;

  end update_row;

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE
                     , X_TAB_TITLE IN RNT_MENU_TABS.TAB_TITLE%TYPE
                     , X_PARENT_TAB IN RNT_MENU_TABS.PARENT_TAB%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_TABS.DISPLAY_SEQ%TYPE
                     , X_TAB_HREF IN RNT_MENU_TABS.TAB_HREF%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENU_TABS
     ( TAB_NAME
     , TAB_TITLE
     , PARENT_TAB
     , DISPLAY_SEQ
     , TAB_HREF)
     values
     ( X_TAB_NAME
     , X_TAB_TITLE
     , X_PARENT_TAB
     , X_DISPLAY_SEQ
     , X_TAB_HREF);

  end insert_row;

  procedure delete_row( X_TAB_NAME IN RNT_MENU_TABS.TAB_NAME%TYPE) is

  begin
    delete from RNT_MENU_TABS
    where TAB_NAME = X_TAB_NAME;

  end delete_row;

end RNT_MENU_TABS_PKG;
/

show errors package RNT_MENU_TABS_PKG
show errors package body RNT_MENU_TABS_PKG

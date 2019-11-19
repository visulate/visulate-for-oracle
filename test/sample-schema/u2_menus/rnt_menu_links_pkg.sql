create or replace package RNT_MENU_LINKS_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_LINKS_PKG
    Purpose:   API's for RNT_MENU_LINKS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version
*******************************************************************************/
  function get_checksum( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                       , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE)
            return RNT_MENU_LINKS_V.CHECKSUM%TYPE;

  procedure update_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                      , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE
                      , X_LINK_URL IN RNT_MENU_LINKS.LINK_URL%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_LINKS.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM IN RNT_MENU_LINKS_V.CHECKSUM%TYPE);

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                     , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE
                     , X_LINK_URL IN RNT_MENU_LINKS.LINK_URL%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_LINKS.DISPLAY_SEQ%TYPE);

  procedure delete_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                       , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE);

end RNT_MENU_LINKS_PKG;
/
create or replace package body RNT_MENU_LINKS_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_LINKS_PKG
    Purpose:   API's for RNT_MENU_LINKS table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version

********************************************************************************/
-------------------------------------------------
--  Private Procedures and Functions
-------------------------------------------------


  procedure lock_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                       , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE) is
     cursor c is
     select * from RNT_MENU_LINKS
     where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and LINK_TITLE = X_LINK_TITLE
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
  function get_checksum( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                       , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE)
            return RNT_MENU_LINKS_V.CHECKSUM%TYPE is

    v_return_value               RNT_MENU_LINKS_V.CHECKSUM%TYPE;
  begin
    select CHECKSUM
    into v_return_value
    from RNT_MENU_LINKS_V
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and LINK_TITLE = X_LINK_TITLE;
    return v_return_value;
  end get_checksum;

  procedure update_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                      , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE
                      , X_LINK_URL IN RNT_MENU_LINKS.LINK_URL%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_LINKS.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM IN RNT_MENU_LINKS_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENU_LINKS_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME, X_MENU_NAME, X_LINK_TITLE);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME, X_MENU_NAME, X_LINK_TITLE);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENU_LINKS
     set MENU_NAME = X_MENU_NAME
     , LINK_TITLE = X_LINK_TITLE
     , LINK_URL = X_LINK_URL
     , DISPLAY_SEQ = X_DISPLAY_SEQ
     where TAB_NAME   = X_TAB_NAME
     and   MENU_NAME  = X_MENU_NAME
     and   LINK_TITLE = X_LINK_TITLE;

  end update_row;

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                     , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE
                     , X_LINK_URL IN RNT_MENU_LINKS.LINK_URL%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_LINKS.DISPLAY_SEQ%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENU_LINKS
     ( TAB_NAME
     , MENU_NAME
     , LINK_TITLE
     , LINK_URL
     , DISPLAY_SEQ)
     values
     ( X_TAB_NAME
     , X_MENU_NAME
     , X_LINK_TITLE
     , X_LINK_URL
     , X_DISPLAY_SEQ);

  end insert_row;

  procedure delete_row( X_TAB_NAME IN RNT_MENU_LINKS.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_LINKS.MENU_NAME%TYPE
                       , X_LINK_TITLE IN RNT_MENU_LINKS.LINK_TITLE%TYPE) is

  begin
    delete from RNT_MENU_LINKS
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and LINK_TITLE = X_LINK_TITLE;

  end delete_row;

end RNT_MENU_LINKS_PKG;
/

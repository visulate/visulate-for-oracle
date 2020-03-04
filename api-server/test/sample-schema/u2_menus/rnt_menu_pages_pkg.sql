create or replace package RNT_MENU_PAGES_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_PAGES_PKG
    Purpose:   API's for RNT_MENU_PAGES table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version
*******************************************************************************/
  function get_checksum( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                       , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                       , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE)
            return RNT_MENU_PAGES_V.CHECKSUM%TYPE;

  procedure update_row( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                      , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                      , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                      , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                      , X_HEADER_CONTENT IN RNT_MENU_PAGES.HEADER_CONTENT%TYPE
                      , X_BODY_CONTENT IN RNT_MENU_PAGES.BODY_CONTENT%TYPE
                      , X_CHECKSUM IN RNT_MENU_PAGES_V.CHECKSUM%TYPE);

  procedure update_row2( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                      , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                      , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                      , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                      , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM IN RNT_MENU_PAGES_V.CHECKSUM%TYPE);
                      
  procedure  insert_row( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                     , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                     , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                     , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                     , X_HEADER_CONTENT IN RNT_MENU_PAGES.HEADER_CONTENT%TYPE
                     , X_BODY_CONTENT IN RNT_MENU_PAGES.BODY_CONTENT%TYPE);
                     
 procedure  insert_row2( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                     , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                     , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                     , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE);

  procedure delete_row( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                       , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                       , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE);

end RNT_MENU_PAGES_PKG;
/
create or replace package body RNT_MENU_PAGES_PKG as
/*******************************************************************************
   Copyright (c) Visulate 2007, 2010        All rights reserved worldwide
    Name:      RNT_MENU_PAGES_PKG
    Purpose:   API's for RNT_MENU_PAGES table
    Revision History
    Ver        Date        Author           Description
    --------   ---------   ---------------- ---------------------
    1.0        07-FEB-10   Auto Generated   Initial Version

********************************************************************************/
-------------------------------------------------
--  Private Procedures and Functions
-------------------------------------------------


  procedure lock_row( X_TAB_NAME  IN RNT_MENU_PAGES.TAB_NAME%TYPE
                    , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                    , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                    , X_SUB_PAGE  IN RNT_MENU_PAGES.SUB_PAGE%TYPE) is
     cursor c is
     select * from RNT_MENU_PAGES
     where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and PAGE_NAME = X_PAGE_NAME
    and SUB_PAGE = X_SUB_PAGE
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
  function get_checksum( X_TAB_NAME  IN RNT_MENU_PAGES.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                       , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                       , X_SUB_PAGE  IN RNT_MENU_PAGES.SUB_PAGE%TYPE)
            return RNT_MENU_PAGES_V.CHECKSUM%TYPE is

    v_return_value               RNT_MENU_PAGES_V.CHECKSUM%TYPE;
  begin
    select CHECKSUM
    into v_return_value
    from RNT_MENU_PAGES_V
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and PAGE_NAME = X_PAGE_NAME
    and SUB_PAGE = X_SUB_PAGE;
    return v_return_value;
  end get_checksum;

  procedure update_row( X_TAB_NAME   IN RNT_MENU_PAGES.TAB_NAME%TYPE
                      , X_MENU_NAME   IN RNT_MENU_PAGES.MENU_NAME%TYPE
                      , X_PAGE_NAME   IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                      , X_SUB_PAGE    IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                      , X_PAGE_TITLE  IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                      , X_HEADER_CONTENT IN RNT_MENU_PAGES.HEADER_CONTENT%TYPE
                      , X_BODY_CONTENT   IN RNT_MENU_PAGES.BODY_CONTENT%TYPE
                      , X_CHECKSUM       IN RNT_MENU_PAGES_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENU_PAGES_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME, X_MENU_NAME, X_PAGE_NAME, X_SUB_PAGE);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME, X_MENU_NAME, X_PAGE_NAME, X_SUB_PAGE);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENU_PAGES
     set MENU_NAME    = X_MENU_NAME
     , PAGE_NAME      = X_PAGE_NAME
     , SUB_PAGE       = X_SUB_PAGE
     , PAGE_TITLE     = X_PAGE_TITLE
     , DISPLAY_SEQ    = X_DISPLAY_SEQ
     , HEADER_CONTENT = X_HEADER_CONTENT
     , BODY_CONTENT   = X_BODY_CONTENT
     where TAB_NAME  = X_TAB_NAME
     and   MENU_NAME = X_MENU_NAME
     and   PAGE_NAME = X_PAGE_NAME
     and   SUB_PAGE  = X_SUB_PAGE;

  end update_row;

  procedure update_row2( X_TAB_NAME   IN RNT_MENU_PAGES.TAB_NAME%TYPE
                      , X_MENU_NAME   IN RNT_MENU_PAGES.MENU_NAME%TYPE
                      , X_PAGE_NAME   IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                      , X_SUB_PAGE    IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                      , X_PAGE_TITLE  IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                      , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                      , X_CHECKSUM       IN RNT_MENU_PAGES_V.CHECKSUM%TYPE)
  is
     l_checksum          RNT_MENU_PAGES_V.CHECKSUM%TYPE;
  begin
     lock_row(X_TAB_NAME, X_MENU_NAME, X_PAGE_NAME, X_SUB_PAGE);

      -- validate checksum
      l_checksum := get_checksum(X_TAB_NAME, X_MENU_NAME, X_PAGE_NAME, X_SUB_PAGE);
      if X_CHECKSUM != l_checksum then
         RAISE_APPLICATION_ERROR(-20002, 'Record has been changed another user.');
      end if;

     update RNT_MENU_PAGES
     set MENU_NAME    = X_MENU_NAME
     , PAGE_NAME      = X_PAGE_NAME
     , SUB_PAGE       = X_SUB_PAGE
     , PAGE_TITLE     = X_PAGE_TITLE
     , DISPLAY_SEQ    = X_DISPLAY_SEQ
     where TAB_NAME  = X_TAB_NAME
     and   MENU_NAME = X_MENU_NAME
     and   PAGE_NAME = X_PAGE_NAME
     and   SUB_PAGE  = X_SUB_PAGE;

  end update_row2;

  procedure  insert_row( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                     , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                     , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                     , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE
                     , X_HEADER_CONTENT IN RNT_MENU_PAGES.HEADER_CONTENT%TYPE
                     , X_BODY_CONTENT IN RNT_MENU_PAGES.BODY_CONTENT%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENU_PAGES
     ( TAB_NAME
     , MENU_NAME
     , PAGE_NAME
     , SUB_PAGE
     , PAGE_TITLE
     , DISPLAY_SEQ
     , HEADER_CONTENT
     , BODY_CONTENT)
     values
     ( X_TAB_NAME
     , X_MENU_NAME
     , X_PAGE_NAME
     , X_SUB_PAGE
     , X_PAGE_TITLE
     , X_DISPLAY_SEQ
     , X_HEADER_CONTENT
     , X_BODY_CONTENT);

  end insert_row;
  
  procedure  insert_row2( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                     , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                     , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                     , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE
                     , X_PAGE_TITLE IN RNT_MENU_PAGES.PAGE_TITLE%TYPE
                     , X_DISPLAY_SEQ IN RNT_MENU_PAGES.DISPLAY_SEQ%TYPE)
  is
     x          number;
  begin

     insert into RNT_MENU_PAGES
     ( TAB_NAME
     , MENU_NAME
     , PAGE_NAME
     , SUB_PAGE
     , PAGE_TITLE
     , DISPLAY_SEQ)
     values
     ( X_TAB_NAME
     , X_MENU_NAME
     , X_PAGE_NAME
     , X_SUB_PAGE
     , X_PAGE_TITLE
     , X_DISPLAY_SEQ);

  end insert_row2;

  procedure delete_row( X_TAB_NAME IN RNT_MENU_PAGES.TAB_NAME%TYPE
                       , X_MENU_NAME IN RNT_MENU_PAGES.MENU_NAME%TYPE
                       , X_PAGE_NAME IN RNT_MENU_PAGES.PAGE_NAME%TYPE
                       , X_SUB_PAGE IN RNT_MENU_PAGES.SUB_PAGE%TYPE) is

  begin
    delete from RNT_MENU_PAGES
    where TAB_NAME = X_TAB_NAME
    and MENU_NAME = X_MENU_NAME
    and PAGE_NAME = X_PAGE_NAME
    and SUB_PAGE = X_SUB_PAGE;

  end delete_row;

end RNT_MENU_PAGES_PKG;
/

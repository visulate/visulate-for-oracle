create or replace view rnt_menu_pages_v as
select TAB_NAME
,      MENU_NAME
,      PAGE_NAME
,      SUB_PAGE
,      PAGE_TITLE
,      DISPLAY_SEQ
,      HEADER_CONTENT
,      BODY_CONTENT
,      rnt_sys_checksum_rec_pkg.get_checksum(
           'TAB_NAME='||TAB_NAME
         ||'MENU_NAME='||MENU_NAME
         ||'PAGE_NAME='||PAGE_NAME
         ||'SUB_PAGE='||SUB_PAGE
         ||'PAGE_TITLE='||PAGE_TITLE
         ||'DISPLAY_SEQ='||DISPLAY_SEQ
         ||'HEADER_CONTENT='||dbms_lob.substr(t.header_content.getclobval(), 1600, 1)
                            ||dbms_lob.getlength(t.header_content.getclobval())
         ||'BODY_CONTENT='||dbms_lob.substr(BODY_CONTENT, 1600, 1) 
                          ||dbms_lob.getlength(BODY_CONTENT)
       ) as CHECKSUM
from RNT_MENU_PAGES t;

CREATE OR REPLACE PACKAGE RNT_OBFURCATION_PASSWORD_PKG AS
/******************************************************************************
   NAME:       RNT_OBFURCATION_PASSWORD_PKG
   PURPOSE:

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        12.12.2007             1. Created this package.
******************************************************************************/

function encrypt(input_string in varchar2, xkey in varchar2) return varchar2;

function decrypt(input_string in varchar2, xkey in varchar2) return varchar2;

END RNT_OBFURCATION_PASSWORD_PKG;
/

CREATE OR REPLACE PACKAGE BODY RNT_OBFURCATION_PASSWORD_PKG AS
/******************************************************************************
   NAME:       RNT_OBFURCATION_PASSWORD_PKG
   PURPOSE:

   REVISIONS:
   Ver        Date        Author           Description
   ---------  ----------  ---------------  ------------------------------------
   1.0        12.12.2007             1. Created this package body.
******************************************************************************/

function encrypt(input_string in varchar2, xkey in varchar2) return varchar2
is
  x_input_string varchar2(2000);
  x_output_string varchar2(2000);
begin
  x_input_string := rpad(input_string,(trunc(length(input_string)/8)+1)*8,chr(0));
  dbms_obfuscation_toolkit.des3encrypt(
     input_string       => x_input_string,
     key_string         => rpad(xkey, 16, xkey),
     encrypted_string   => x_output_string);
  return rawtohex(UTL_RAW.CAST_TO_RAW(x_output_string));
end;

function decrypt(input_string in varchar2, xkey in varchar2) return varchar2
is
  x_input_string varchar2(2000);
  x_output_string varchar2(2000);
begin
 x_input_string := UTL_RAW.CAST_TO_VARCHAR2(hextoraw(input_string));
 dbms_obfuscation_toolkit.des3decrypt(
  input_string     => x_input_string,
  key_string       => rpad(xkey, 16, xkey),
  decrypted_string => x_output_string);
  
  return rtrim(x_output_string, CHR(0));
end;

END RNT_OBFURCATION_PASSWORD_PKG;
/

SHOW ERRORS;

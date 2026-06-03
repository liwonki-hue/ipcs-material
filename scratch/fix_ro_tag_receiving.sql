-- Restriction Orifice receiving 태그 통일: R0(숫자0) → RO(영문O)
SET search_path TO material, public;

UPDATE material.receiving
  SET tag = REPLACE(tag, '-R0-', '-RO-')
  WHERE tag LIKE '%-R0-%';

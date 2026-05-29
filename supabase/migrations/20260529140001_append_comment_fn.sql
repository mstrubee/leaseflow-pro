-- Appends a tagged comment to maintenance_forms.additional_comments
create or replace function append_maintenance_comment(
  p_form_id uuid,
  p_comment  text
) returns void language plpgsql security definer as $$
begin
  update maintenance_forms
  set additional_comments = case
    when additional_comments is null or additional_comments = ''
      then p_comment
    else additional_comments || E'\n' || p_comment
  end
  where id = p_form_id;
end;
$$;
